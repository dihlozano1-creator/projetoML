document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.target}`).classList.add('active');

            // Update mode indicator
            const indicator = document.getElementById('mode-indicator');
            if (indicator) {
                indicator.textContent = btn.dataset.target === 'single'
                    ? 'Modo 1 Link: Insira o link acima'
                    : 'Modo Lote: Selecione sua planilha abaixo';
            }

            // Hide results and errors when switching tabs
            hideElement(document.getElementById('table-result-container'));
            hideElement(document.getElementById('error-message'));
        });
    });

    // Single Scrape Logic (Reused)
    const form = document.getElementById('scrape-form');
    const urlInput = document.getElementById('url-input');
    const submitBtn = document.getElementById('submit-btn');

    const loader = document.getElementById('loader');
    const progContainer = document.getElementById('progress-container');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');

    // Unified result elements
    const tableResultContainer = document.getElementById('table-result-container');
    const resultsTbody = document.getElementById('results-tbody');
    const batchStats = document.getElementById('batch-stats');
    const exportCsvBtn = document.getElementById('export-csv-btn');

    let currentResults = [];


    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = urlInput.value.trim();
        if (!url) return;

        hideElement(errorMessage);
        hideElement(tableResultContainer);
        hideElement(progContainer);
        showElement(loader);
        document.getElementById('loader-text').textContent = 'Analisando e extraindo...';
        submitBtn.disabled = true;

        try {
            const apiUrl = `/api/scrape?url=${encodeURIComponent(url)}`;
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Erro ao processar a requisição');

            currentResults = [data]; // Put single result into our unified array
            renderTable(currentResults);

            hideElement(loader);
            showElement(tableResultContainer);

        } catch (error) {
            hideElement(loader);
            errorText.textContent = error.message;
            showElement(errorMessage);
        } finally {
            submitBtn.disabled = false;
        }
    });

    // Batch Scrape Logic
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    const fileInfo = document.getElementById('file-info');
    const fileName = document.getElementById('file-name');
    const dropzoneContent = document.querySelector('.dropzone-content');
    const removeFileBtn = document.getElementById('remove-file-btn');
    const batchSubmitBtn = document.getElementById('batch-submit-btn');

    // Drag and drop events
    ['dragover', 'dragenter'].forEach(e => dropzone.addEventListener(e, (ev) => {
        ev.preventDefault();
        dropzone.classList.add('dragover');
    }));

    ['dragleave', 'dragend', 'drop'].forEach(e => dropzone.addEventListener(e, (ev) => {
        ev.preventDefault();
        dropzone.classList.remove('dragover');
    }));

    dropzone.addEventListener('drop', (e) => {
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelection();
        }
    });

    browseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelection);

    removeFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.value = '';
        hideElement(fileInfo);
        showElement(dropzoneContent);
        hideElement(batchSubmitBtn);
    });

    function handleFileSelection() {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            fileName.textContent = file.name;
            hideElement(dropzoneContent);
            showElement(fileInfo);
            showElement(batchSubmitBtn);
        }
    }

    batchSubmitBtn.addEventListener('click', async () => {
        if (!fileInput.files.length) return;

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        hideElement(errorMessage);
        hideElement(tableResultContainer);
        showElement(loader);

        // Show simulated progress bar for batch
        document.getElementById('loader-text').textContent = 'Processando em lote (pode levar alguns minutos)...';
        showElement(progContainer);
        const pbar = document.getElementById('progress-bar');
        pbar.style.width = '10%';
        batchSubmitBtn.disabled = true;

        try {
            // Simulated progress animation since backend processing is synchronous
            let p = 10;
            const interval = setInterval(() => { if (p < 90) { p += 5; pbar.style.width = `${p}%`; } }, 2000);

            const response = await fetch('/api/scrape/batch', {
                method: 'POST',
                body: formData
            });

            clearInterval(interval);
            pbar.style.width = '100%';

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Erro ao processar lote.');

            currentResults = data.results;
            renderTable(currentResults);

            setTimeout(() => {
                hideElement(loader);
                showElement(tableResultContainer);
            }, 500);

        } catch (error) {
            hideElement(loader);
            errorText.textContent = error.message;
            showElement(errorMessage);
        } finally {
            batchSubmitBtn.disabled = false;
        }
    });

    function renderTable(results) {
        resultsTbody.innerHTML = '';

        // 1. Extract unique characteristics keys
        const allCharacteristics = new Set();
        results.forEach(res => {
            if (res.characteristics) {
                Object.keys(res.characteristics).forEach(key => allCharacteristics.add(key));
            }
        });
        const dynamicCols = Array.from(allCharacteristics);

        // 2. Rebuild thead
        const theadRow = document.getElementById('results-thead-row');
        if (theadRow) {
            theadRow.innerHTML = `<th>Status</th><th>Produto</th><th>Descrição</th>`;
            dynamicCols.forEach(col => {
                const th = document.createElement('th');
                th.textContent = col;
                theadRow.appendChild(th);
            });
            theadRow.insertAdjacentHTML('beforeend', `<th>Ações</th>`);
        }

        // 3. Render rows
        let successCount = 0;
        results.forEach(res => {
            if (res.success) successCount++;
            const tr = document.createElement('tr');

            const badgeClass = res.success ? 'status-success' : 'status-error';
            const statusText = res.success ? 'Concluído' : 'Falhou';
            const titleHtml = res.success ? res.title : `<span style="color:var(--text-secondary)">-</span>`;
            const descSnippet = res.success && res.description
                ? res.description.replace(/\n/g, ' ')
                : `<span style="color:var(--error)">${res.error || 'N/A'}</span>`;

            let innerHtml = `
                <td><span class="status-badge ${badgeClass}">${statusText}</span></td>
                <td>${titleHtml}</td>
                <td><div class="td-snippet">${descSnippet}</div></td>
            `;

            dynamicCols.forEach(col => {
                const val = (res.characteristics && res.characteristics[col]) ? res.characteristics[col] : '-';
                innerHtml += `<td><div class="td-snippet" style="max-width:200px;" title="${val}">${val}</div></td>`;
            });

            innerHtml += `
                <td>
                    <a href="${res.url}" target="_blank" class="external-link" style="padding: 0.2rem 0.5rem; font-size: 0.8rem">
                        Ver
                    </a>
                </td>
            `;

            tr.innerHTML = innerHtml;
            resultsTbody.appendChild(tr);
        });

        batchStats.textContent = `${successCount} extraídos com sucesso de ${results.length}.`;
    }

    // Export Logic
    exportCsvBtn.addEventListener('click', () => {
        if (!currentResults || !currentResults.length) {
            alert("Nenhum dado para exportar ainda.");
            return;
        }

        try {
            // Re-extract unique characteristics for export header
            const allCharacteristics = new Set();
            currentResults.forEach(res => {
                if (res.characteristics) {
                    Object.keys(res.characteristics).forEach(key => allCharacteristics.add(key));
                }
            });
            const dynamicCols = Array.from(allCharacteristics);

            // Base CSV Header
            let csvContent = "URL;Status;Título;Descrição";
            dynamicCols.forEach(col => {
                csvContent += `;"${col.replace(/"/g, '""')}"`;
            });
            csvContent += "\n";

            currentResults.forEach(res => {
                const url = `"${res.url || ''}"`;
                const status = `"${res.success ? 'Concluído' : 'Erro: ' + (res.error || '')}"`;
                const title = `"${(res.title || '').replace(/"/g, '""')}"`;

                // Remove line breaks to prevent CSV rows from breaking in Excel
                const cleanDesc = (res.description || '').replace(/[\n\r]+/g, '  ');
                const desc = `"${cleanDesc.replace(/"/g, '""')}"`;

                let rowStr = `${url};${status};${title};${desc}`;

                // Append each dynamic column value
                dynamicCols.forEach(col => {
                    const val = (res.characteristics && res.characteristics[col]) ? res.characteristics[col] : '';
                    const cleanVal = String(val).replace(/[\n\r]+/g, ' ').replace(/"/g, '""');
                    rowStr += `;"${cleanVal}"`;
                });

                csvContent += rowStr + "\n";
            });

            const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });

            // Check for MS Edge / IE specific API
            if (navigator.msSaveBlob) {
                navigator.msSaveBlob(blob, `extracao-ml-${new Date().getTime()}.csv`);
            } else {
                const link = document.createElement("a");
                if (link.download !== undefined) {
                    const url = URL.createObjectURL(blob);
                    link.setAttribute("href", url);
                    link.setAttribute("download", `extracao-ml-${new Date().getTime()}.csv`);
                    link.style.visibility = 'hidden';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            }
        } catch (e) {
            console.error("Erro ao exportar CSV: ", e);
            alert("Ocorreu um erro ao tentar exportar o arquivo CSV.");
        }
    });

    // Helpers
    function showElement(el) { el.classList.remove('hidden'); }
    function hideElement(el) { el.classList.add('hidden'); }
});
