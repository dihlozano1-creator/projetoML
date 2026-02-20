const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const xlsx = require('xlsx');
const csv = require('csv-parser');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Explicit route for the homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Set up Multer for file uploads - Using /tmp for Vercel/Serverless read-only filesystem
const upload = multer({ dest: '/tmp/' });

// Helper function to add a delay
const delay = ms => new Promise(res => setTimeout(res, ms));

// Core scraping function
const scrapeMercadoLivre = async (url) => {
    try {
        if (!url || !url.includes('mercadolivre.com.br')) {
            return { url, success: false, error: 'URL inválida' };
        }

        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            }
        });

        const html = response.data;
        const $ = cheerio.load(html);

        const descriptionSelectors = [
            '.ui-pdp-description__content',
            '.item-description__text',
            '.ui-pdp-description'
        ];

        let description = null;

        for (const selector of descriptionSelectors) {
            const el = $(selector);
            if (el.length > 0) {
                el.find('br').replaceWith('\n');
                description = el.text().trim();
                break;
            }
        }

        const title = $('h1.ui-pdp-title').text().trim() || $('meta[property="og:title"]').attr('content');
        const image = $('.ui-pdp-gallery__figure__image').attr('src') || $('meta[property="og:image"]').attr('content');

        const characteristics = {};
        $('.andes-table__row').each((i, el) => {
            const key = $(el).find('.andes-table__header').text().trim();
            const value = $(el).find('.andes-table__column').text().trim();
            if (key && value) {
                characteristics[key] = value;
            }
        });

        if (description) {
            return { url, success: true, title, description, image, characteristics };
        } else {
            return { url, success: false, error: 'Descrição não encontrada' };
        }

    } catch (error) {
        return { url, success: false, error: 'Falha na extração ou bloqueio' };
    }
};

app.get('/api/scrape', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'A URL do Mercado Livre é obrigatória' });
    }

    const result = await scrapeMercadoLivre(url);
    if (result.success) {
        res.json(result);
    } else {
        const status = result.error === 'URL inválida' ? 400 : (result.error === 'Descrição não encontrada' ? 404 : 500);
        res.status(status).json({ error: result.error });
    }
});

app.post('/api/scrape/batch', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    let links = [];

    try {
        if (fileExt === '.xlsx' || fileExt === '.xls') {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

            // Assume links are in the first column or find the column with 'mercadolivre.com.br'
            data.forEach(row => {
                const cell = row.find(c => typeof c === 'string' && c.includes('mercadolivre.com.br'));
                if (cell) {
                    links.push(cell.trim());
                } else if (row.length > 0 && typeof row[0] === 'string' && row[0].includes('http')) {
                    // Fallback to first column if it's a URL
                    links.push(row[0].trim());
                }
            });

        } else if (fileExt === '.csv') {
            await new Promise((resolve, reject) => {
                fs.createReadStream(filePath)
                    .pipe(csv({ headers: false }))
                    .on('data', (row) => {
                        const values = Object.values(row);
                        const cell = values.find(c => typeof c === 'string' && c.includes('mercadolivre.com.br'));
                        if (cell) {
                            links.push(cell.trim());
                        } else if (values.length > 0 && typeof values[0] === 'string' && values[0].includes('http')) {
                            links.push(values[0].trim());
                        }
                    })
                    .on('end', resolve)
                    .on('error', reject);
            });
        } else {
            fs.unlinkSync(filePath); // Clean up
            return res.status(400).json({ error: 'Formato de arquivo não suportado. Use .xlsx ou .csv' });
        }

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        // Remove duplicates and limit batch size to prevent server timeout/blocks
        links = [...new Set(links)].slice(0, 50);

        if (links.length === 0) {
            return res.status(400).json({ error: 'Nenhum link do Mercado Livre encontrado no arquivo.' });
        }

        // Process links sequentially with a delay to avoid rate limiting
        const results = [];
        for (let i = 0; i < links.length; i++) {
            const result = await scrapeMercadoLivre(links[i]);
            results.push(result);

            if (i < links.length - 1) {
                await delay(1500); // 1.5 seconds delay between requests
            }
        }

        res.json({ success: true, total: links.length, results });

    } catch (error) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        console.error('Batch process error:', error);
        res.status(500).json({ error: 'Erro ao processar o arquivo de lote.' });
    }
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
