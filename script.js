// --- CONFIGURATION ---
// PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL HERE
//const SCRIPT_URL = "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzGgb_7cSl5MVxrXWMaFoRpInCS5DnzbtVAi7tMLQ-svB4yni56QfQcZ-hGa7HGxsJI/exec";
// --- DOM ELEMENTS ---
const uploadForm = document.getElementById('upload-form');
const uploaderNameInput = document.getElementById('uploader-name');
const pdfFileInput = document.getElementById('pdf-file');
const uploadStatus = document.getElementById('upload-status');
const uploadButton = document.getElementById('upload-button');

const fileListContainer = document.getElementById('file-list-container');
const pdfViewer = document.getElementById('pdf-viewer');
const pdfCanvas = document.getElementById('pdf-canvas');
const pdfTitle = document.getElementById('pdf-title');
const pageNumDisplay = document.getElementById('page-num-display');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');

// --- PDF.js STATE ---
let pdfDoc = null;
let pageNum = 1;
let pageIsRendering = false;
let pageNumIsPending = null;

// Use the worker from the same CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://mozilla.github.io/pdf.js/build/pdf.worker.js`;

// --- FUNCTIONS ---

/**
 * Renders a specific page of the PDF.
 * @param {number} num - The page number to render.
 */
const renderPage = num => {
    pageIsRendering = true;
    
    // Get page
    pdfDoc.getPage(num).then(page => {
        const viewport = page.getViewport({ scale: 1.5 });
        pdfCanvas.height = viewport.height;
        pdfCanvas.width = viewport.width;

        const renderContext = {
            canvasContext: pdfCanvas.getContext('2d'),
            viewport: viewport
        };

        page.render(renderContext).promise.then(() => {
            pageIsRendering = false;
            if (pageNumIsPending !== null) {
                renderPage(pageNumIsPending);
                pageNumIsPending = null;
            }
        });
    });

    pageNumDisplay.textContent = `Page ${num} of ${pdfDoc.numPages}`;
};

/**
 * Queues a page to be rendered if another is already in progress.
 * @param {number} num The page number to queue.
 */
const queueRenderPage = num => {
    if (pageIsRendering) {
        pageNumIsPending = num;
    } else {
        renderPage(num);
    }
};

const showPrevPage = () => {
    if (pageNum <= 1) return;
    pageNum--;
    queueRenderPage(pageNum);
};

const showNextPage = () => {
    if (pageNum >= pdfDoc.numPages) return;
    pageNum++;
    queueRenderPage(pageNum);
};

/**
 * Loads and displays a PDF from a Google Drive file ID.
 * @param {string} fileId The ID of the file in Google Drive.
 * @param {string} fileName The name of the file to display.
 */
const viewPdf = (fileId, fileName) => {
    pdfTitle.textContent = 'Loading...';
    // The URL to directly download the file content from Drive
    const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
    
    // Asynchronously download PDF
    const loadingTask = pdfjsLib.getDocument({ url });
    loadingTask.promise.then(doc => {
        pdfDoc = doc;
        pdfTitle.textContent = fileName;
        pageNum = 1;
        renderPage(pageNum);
        prevPageBtn.disabled = false;
        nextPageBtn.disabled = false;
    }).catch(err => {
        console.error('Error loading PDF:', err);
        pdfTitle.textContent = 'Failed to load PDF.';
    });
};

/**
 * Fetches the list of uploaded files from the Google Apps Script and displays them.
 */
const loadFileList = () => {
    fetch(SCRIPT_URL)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                fileListContainer.innerHTML = ''; // Clear current list
                if(data.files.length === 0) {
                    fileListContainer.innerHTML = '<p>No documents have been uploaded yet.</p>';
                    return;
                }

                data.files.forEach(file => {
                    const item = document.createElement('div');
                    item.className = 'file-item';
                    item.innerHTML = `
                        <strong>${file.StoredFileName}</strong>
                        <span>Uploaded by: ${file.UploaderName} on ${new Date(file.Timestamp).toLocaleDateString()}</span>
                    `;
                    // When an item is clicked, call viewPdf with its ID and name
                    item.onclick = () => viewPdf(file.DriveFileID, file.StoredFileName);
                    fileListContainer.appendChild(item);
                });
            } else {
                fileListContainer.innerHTML = '<p>Error loading file list.</p>';
            }
        })
        .catch(err => {
            console.error('Error fetching file list:', err);
            fileListContainer.innerHTML = '<p>Could not connect to the server.</p>';
        });
};

/**
 * Handles the file upload form submission.
 * @param {Event} e The form submission event.
 */
const handleUpload = (e) => {
    e.preventDefault();
    
    if (!uploaderNameInput.value || !pdfFileInput.files[0]) {
        uploadStatus.textContent = 'Please fill out all fields.';
        return;
    }

    uploadButton.disabled = true;
    uploadStatus.textContent = 'Uploading, please wait...';
    
    const file = pdfFileInput.files[0];
    const reader = new FileReader();
    reader.readAsDataURL(file); // Reads file as base64
    
    reader.onload = (event) => {
        const fileContent = event.target.result.split(',')[1]; // Get base64 part
        
        const payload = {
            uploaderName: uploaderNameInput.value,
            originalFileName: file.name,
            fileContent: fileContent
        };
        
        fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                uploadStatus.textContent = `Upload successful: ${data.fileName}`;
                uploadForm.reset(); // Clear the form
                loadFileList(); // Refresh the file list
            } else {
                throw new Error(data.message);
            }
        })
        .catch(err => {
            console.error('Upload Error:', err);
            uploadStatus.textContent = `Upload failed: ${err.message}`;
        })
        .finally(() => {
            uploadButton.disabled = false; // Re-enable button
        });
    };
    
    reader.onerror = (error) => {
        console.error('File Reading Error:', error);
        uploadStatus.textContent = 'Failed to read the file.';
        uploadButton.disabled = false;
    };
};

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    loadFileList();
    prevPageBtn.disabled = true;
    nextPageBtn.disabled = true;
});
uploadForm.addEventListener('submit', handleUpload);
prevPageBtn.addEventListener('click', showPrevPage);
nextPageBtn.addEventListener('click', showNextPage);
