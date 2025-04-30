import { Component, OnInit, OnDestroy, Inject, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef} from '@angular/core';
import { FileTransfer, FileTransferObject } from '@awesome-cordova-plugins/file-transfer/ngx';
import { ActionSheetController, Platform, ToastController } from '@ionic/angular';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { File as CordovaFile } from '@awesome-cordova-plugins/file/ngx';
import { FileChooser } from '@awesome-cordova-plugins/file-chooser/ngx';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { FileOpener } from '@awesome-cordova-plugins/file-opener/ngx';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { TranslateService } from '@ngx-translate/core';
import { createWorker, Worker } from 'tesseract.js';
import { Capacitor } from '@capacitor/core';
import * as pdfjsLib from 'pdfjs-dist';
import { saveAs } from 'file-saver';
import * as mammoth from 'mammoth';
import * as JSZip from 'jszip';
import Quill from 'quill';


@Component({
  selector: 'app-scan',
  templateUrl: './scan.page.html',
  styleUrls: ['./scan.page.scss'],
  standalone: false
})
export class ScanPage implements OnInit, OnDestroy, AfterViewInit {
  fileTransfer: FileTransferObject;
  isNative: boolean = Capacitor.getPlatform() !== 'web';
  imageUrl: string | undefined; // Store image Data URL for display and OCR
  isProcessing: boolean = false; // Track OCR processing state
  private tesseractWorker: Worker | undefined; // Tesseract.js worker
  @ViewChild('editor', { static: false }) editorElement!: ElementRef;
  quillEditor: Quill | undefined;
  recognizedText: string | undefined = '';

  constructor(
    private fileChooser: FileChooser,
    private actionSheetCtrl: ActionSheetController,
    private toastController: ToastController,
    private translate: TranslateService,
    private platform: Platform,
    private fileOpener: FileOpener,
    private transfer: FileTransfer,
    @Inject(CordovaFile) private file: CordovaFile,
    private cdr: ChangeDetectorRef
  ) {
    this.fileTransfer = this.transfer.create();
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = this.getWorkerSrc();
  }

  

  ngAfterViewInit() {
    console.log('ngAfterViewInit - Editor element:', this.editorElement);
    this.initializeQuillEditor();
    this.cdr.detectChanges();
  }

  private initializeQuillEditor() {
    if (this.editorElement && this.editorElement.nativeElement) {
      this.quillEditor = new Quill(this.editorElement.nativeElement, {
        theme: 'snow',
        modules: {
          toolbar: [
            ['bold', 'italic', 'underline'],
            [{ 'background': [] }], // Highlighting
            ['link'], // Hyperlink support
            ['clean'] // Remove formatting
          ]
        },
        placeholder: this.translate.instant('SCAN.EDIT_TEXT')
      });

      // Set initial text if recognizedText exists
      if (this.recognizedText && this.recognizedText !== '<p><br></p>') {
        this.quillEditor.setText(this.recognizedText);
      }

      // Update recognizedText when editor content changes
      this.quillEditor.on('text-change', () => {
        const content = this.quillEditor!.root.innerHTML;
        this.recognizedText = content; // Store HTML content for saving
      });
      console.log('Quill editor initialized:', this.quillEditor);
    } else {
      console.error('Editor element not found');
    }
  }

  // Update text from editor (optional, for manual updates)
  updateText() {
    if (this.quillEditor) {
      this.recognizedText = this.quillEditor.root.innerHTML;
    }
  }

  private updateEditorText(text: string) {
    this.recognizedText = text;
    if (this.quillEditor && text) {
      this.quillEditor.setText(text);
      this.recognizedText = this.quillEditor.root.innerHTML; // Update to HTML format
    } else if (!this.quillEditor && this.editorElement && this.editorElement.nativeElement) {
      // Reinitialize editor if it hasn't been set up
      this.initializeQuillEditor();
      if (this.quillEditor && text) {
        (this.quillEditor as Quill).setText(text);
        this.recognizedText = (this.quillEditor as Quill).root.innerHTML;
      }
    }
    this.cdr.detectChanges(); // Trigger change detection
  }

  // Save text to a file
  async saveTextToFile() {
    if (!this.recognizedText || this.recognizedText === '<p><br></p>') {
      await this.showWarningToast('SCAN.NO_TEXT');
      return;
    }

    const fileName = `recognized-text-${Date.now()}.docx`;

    try {
      // Create a new DOCX document
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: this.parseHtmlToDocx(this.recognizedText)
          }
        ]
      });

      // Generate the DOCX file as a blob
      const blob = await Packer.toBlob(doc);

      if (this.isNative) {
        // Save file for native platforms (Android)
        const base64Data = await this.blobToBase64(blob);
        await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Documents
        });
        console.log('DOCX saved to:', fileName);
        await this.showInfoToast('SCAN.SUCCESS_SAVED');

        // Open the file
        const filePath = await Filesystem.getUri({
          path: fileName,
          directory: Directory.Documents
        });
        await this.fileOpener.open(filePath.uri, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      } else {
        // Save file for web
        saveAs(blob, fileName);
        console.log('DOCX downloaded:', fileName);
        await this.showInfoToast('SCAN.SUCCESS_SAVED');
      }
    } catch (error) {
      console.error('Error saving DOCX file:', error);
      await this.showWarningToast('SCAN.ERROR_SAVED');
    }
  }
  // Helper method to convert HTML to DOCX paragraphs
  private parseHtmlToDocx(html: string): Paragraph[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const paragraphs: Paragraph[] = [];

    // Process each paragraph (<p>) or other elements
    const elements = doc.querySelectorAll('p, div, span');
    elements.forEach((element) => {
      const textRuns: TextRun[] = [];

      // Process text nodes and inline formatting
      const processNode = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          textRuns.push(new TextRun({ text: node.textContent || '' }));
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const runProps: any = { text: el.textContent || '' };

          // Apply basic formatting
          if (el.tagName === 'B' || el.tagName === 'STRONG') {
            runProps.bold = true;
          }
          if (el.tagName === 'I' || el.tagName === 'EM') {
            runProps.italics = true;
          }
          if (el.tagName === 'U') {
            runProps.underline = true;
          }
          if (el.style.backgroundColor) {
            // Note: docx library has limited support for background color
            console.log('Background color detected, not fully supported in DOCX');
          }
          if (el.tagName === 'A') {
            runProps.text = `${el.textContent} (${el.getAttribute('href')})`; // Include link as text
          }

          textRuns.push(new TextRun(runProps));
        }
      };

      // Recursively process child nodes
      element.childNodes.forEach(processNode);

      if (textRuns.length > 0) {
        paragraphs.push(new Paragraph({ children: textRuns }));
      }
    });

    return paragraphs.length > 0 ? paragraphs : [new Paragraph({ children: [new TextRun({ text: 'No content' })] })];
  }

  // Helper method to convert Blob to Base64 for native file saving
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private getWorkerSrc(): string {
    if (Capacitor.getPlatform() === 'web') {
      return '/assets/pdf.worker.min.mjs';
    } else {
      return Capacitor.convertFileSrc('public/assets/pdf.worker.min.mjs');
    }
  }

  async ngOnInit() {
    try {
      // Initialize Tesseract worker for Czech
      this.tesseractWorker = await createWorker('ces', 1, {
        logger: (m) => console.log(m) // Log progress
      });
      console.log('Tesseract worker initialized');
    } catch (error) {
      console.error('Failed to initialize Tesseract worker:', error);
      await this.showWarningToast('SCAN.ERROR_TEXT');
    }
  }

  async ngOnDestroy() {
    // Terminate Tesseract worker to free resources
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
    }
  }

  // Native-only scan with camera
  async scanWithCamera() {
    if (!this.isNative) return;
    try {
      const image = await Camera.getPhoto({
        quality: 90, // Adjust the quality if too slow processing
        allowEditing: false,
        resultType: CameraResultType.DataUrl, // DataUrl for Tesseract.js
        source: CameraSource.Camera
      });
      this.imageUrl = image.dataUrl;
      console.log('Image captured from Camera:', this.imageUrl);
      await this.showInfoToast('SCAN.SUCCESS_IMAGE');
    } catch (error) {
      console.error('Error capturing image from camera:', error);
      await this.showWarningToast('SCAN.ERROR_IMAGE');
    }
  }

  // Native-only scan from gallery
  async scanFromGallery() {
    if (!this.isNative) return;
    try {
      const image = await Camera.getPhoto({
        quality: 90, // Adjust the quality if too slow processing
        allowEditing: false,
        resultType: CameraResultType.DataUrl, // DataUrl for Tesseract.js
        source: CameraSource.Photos
      });
      this.imageUrl = image.dataUrl;
      console.log('Image selected from Gallery:', this.imageUrl);
      await this.showInfoToast('SCAN.SUCCESS_IMAGE');
    } catch (error) {
      console.error('Error selecting image from gallery:', error);
      await this.showWarningToast('SCAN.ERROR_IMAGE');
    }
  }

  async scanFromDocument() {
    if (this.isNative) {
      await this.nativeFilePicker();
    } else {
      this.WebFileInput();
    }
  }

  // Native File Picker
  async nativeFilePicker() {
    try {
      const uri = await this.fileChooser.open();
      const filePath = await this.file.resolveLocalFilesystemUrl(uri);
      const fileUrl = filePath.nativeURL;
      const fileExtension = this.getFileExtension(fileUrl);

      if (!fileExtension) {
        await this.showWarningToast('SCAN.UNSUPPORTED_FILE_TYPE');
        return;
      }

      if (['png', 'jpg', 'jpeg'].includes(fileExtension)) {
        // Convert file to Data URL for Tesseract.js
        const fileEntry = filePath as any;
        const fileData = await new Promise<string>((resolve, reject) => {
          fileEntry.file((file: File) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file as unknown as Blob);
          }, reject);
        });
        this.imageUrl = fileData;
        console.log('Image selected for OCR:', this.imageUrl);
        await this.showInfoToast('SCAN.SUCCESS_IMAGE');
      } else {
        // Handle text-based files
        const fileContent = await this.readFileContent(fileUrl, fileExtension);
        if (fileContent) {
          this.updateEditorText(fileContent);
          console.log('Text extracted:', this.recognizedText);
          await this.showInfoToast('SCAN.SUCCESS_TEXT');
        } else {
          await this.openFile(fileUrl, this.getMimeType(fileExtension));
        }
      }
    } catch (error) {
      console.error('Error opening document:', error);
      await this.showWarningToast('SCAN.UNSUPPORTED_FILE_TYPE');
    }
  }

  // Web-only file input trigger
  WebFileInput() {
    const fileInput = document.getElementById('webFileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  // Handle file selection on web
  async handleWebFileSelection(event: Event) {
    const input = event.target as HTMLInputElement;
    const file: File | undefined = input.files?.[0];
    if (!file) {
      await this.showWarningToast('SCAN.UNSUPPORTED_FILE_TYPE');
      return;
    }
    console.log('Selected file:', file);
    const fileExtension = this.getFileExtension(file.name);
    if (!fileExtension) {
      await this.showWarningToast('SCAN.UNSUPPORTED_FILE_TYPE');
      return;
    }
    if (['png', 'jpg', 'jpeg'].includes(fileExtension)) {
      // Convert File to Data URL for Tesseract.js
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      this.imageUrl = fileData;
      console.log('Image selected for OCR:', this.imageUrl);
      await this.showInfoToast('SCAN.SUCCESS_IMAGE');
    } else {
      // Handle text-based files
      const fileContent = await this.readWebFileContent(file, fileExtension);
      if (fileContent) {
        this.updateEditorText(fileContent);
        console.log('Text extracted:', this.recognizedText);
        await this.showInfoToast('SCAN.SUCCESS_TEXT');
      } else {
        const fileUrl = URL.createObjectURL(file);
        await this.openFile(fileUrl, this.getMimeType(fileExtension));
      }
    }
  }

// Read file content (native)
async readFileContent(fileUrl: string, extension: string): Promise<string | null> {
  try {
    switch (extension) {
      case 'pdf':
        return await this.extractTextFromPDF(fileUrl);
      case 'txt':
        return await this.extractTextFromTXT(fileUrl);
      case 'docx':
        return await this.extractTextFromDOCX(fileUrl);
      case 'odt':
        return await this.extractTextFromODT(fileUrl);
      default:
        return null;
    }
  } catch (error) {
    console.error(`Error reading ${extension} file:`, error);
    await this.showWarningToast('SCAN.ERROR_TEXT');
    return null;
  }
}

// Read file content (web)
async readWebFileContent(file: File, extension: string): Promise<string | null> {
  try {
    switch (extension) {
      case 'pdf':
        return await this.extractTextFromPDFWeb(file);
      case 'txt':
        return await this.extractTextFromTXTWeb(file);
      case 'docx':
        return await this.extractTextFromDOCXWeb(file);
      case 'odt':
        return await this.extractTextFromODTWeb(file);
      default:
        return null;
    }
  } catch (error) {
    console.error(`Error reading ${extension} file:`, error);
    await this.showWarningToast('SCAN.ERROR_TEXT');
    return null;
  }
}

// Extract text from PDF (native)
async extractTextFromPDF(fileUrl: string): Promise<string> {
  try {
    const fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);
    const filePath = this.file.tempDirectory;
    const entry = await this.fileTransfer.download(fileUrl, filePath + fileName).then((entry) => entry);
    const arrayBuffer = await this.file.readAsArrayBuffer(filePath, fileName);
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(' ') + '\n';
    }
    return text;
  } catch (error) {
    console.error('Failed to extract text from PDF:', error);
    await this.showWarningToast('SCAN.ERROR_PDF_PROCESSING');
    return '';
  }
}

// Extract text from PDF (web)
async extractTextFromPDFWeb(file: File): Promise<string> {
  try {
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(' ') + '\n';
    }
    return text;
  } catch (error) {
    console.error('Failed to extract text from PDF (web):', error);
    await this.showWarningToast('SCAN.ERROR_PDF_PROCESSING');
    return '';
  }
}

// Extract text from TXT (native)
async extractTextFromTXT(fileUrl: string): Promise<string> {
  const fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);
  const filePath = fileUrl.substring(0, fileUrl.lastIndexOf('/'));
  return await this.file.readAsText(filePath, fileName);
}

// Extract text from TXT (web)
async extractTextFromTXTWeb(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// Extract text from DOCX (native)
async extractTextFromDOCX(fileUrl: string): Promise<string> {
  const fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);
  const filePath = this.file.tempDirectory;
  const entry = await this.fileTransfer.download(fileUrl, filePath + fileName).then((entry) => entry);
  const arrayBuffer = await this.file.readAsArrayBuffer(filePath, fileName);
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

// Extract text from DOCX (web)
async extractTextFromDOCXWeb(file: File): Promise<string> {
  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

// Extract text from ODT (native) - Basic implementation
async extractTextFromODT(fileUrl: string): Promise<string> {
  const fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);
  const filePath = this.file.tempDirectory;
  const entry = await this.fileTransfer.download(fileUrl, filePath + fileName).then((entry) => entry);
  const arrayBuffer = await this.file.readAsArrayBuffer(filePath, fileName);
  const zip = await JSZip.loadAsync(arrayBuffer);
  const contentXml = await zip.file('content.xml')?.async('string');
  if (!contentXml) throw new Error('No content.xml found in ODT');
  // Basic text extraction (strip XML tags)
  const text = contentXml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return text;
}

// Extract text from ODT (web) - Basic implementation
async extractTextFromODTWeb(file: File): Promise<string> {
  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
  const zip = await JSZip.loadAsync(arrayBuffer);
  const contentXml = await zip.file('content.xml')?.async('string');
  if (!contentXml) throw new Error('No content.xml found in ODT');
  const text = contentXml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return text;
}

// Get MIME type
getMimeType(extension: string): string {
  const mimeTypes: { [key: string]: string } = {
    pdf: 'application/pdf',
    txt: 'text/plain',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    odt: 'application/vnd.oasis.opendocument.text',
    rtf: 'application/rtf',
  };
  return mimeTypes[extension] || 'application/octet-stream';
}

  // OCR for images
  async recognizeText() {
    if (!this.imageUrl) {
      await this.showWarningToast('SCAN.NO_IMAGE');
      return;
    }
    if (!this.tesseractWorker) {
      await this.showWarningToast('SCAN.ERROR_TEXT');
      console.error('Tesseract worker not initialized');
      return;
    }

    this.isProcessing = true;
    try {
      const result = await this.tesseractWorker.recognize(this.imageUrl);
      this.updateEditorText(result.data.text);
      console.log('Recognized Text:', this.recognizedText);
      await this.showInfoToast('SCAN.SUCCESS_TEXT');
      // Explicitly set text in Quill editor
      if (this.quillEditor && this.recognizedText) {
        this.quillEditor.setText(this.recognizedText);
        this.recognizedText = this.quillEditor.root.innerHTML;
      }
    } catch (error) {
      console.error('OCR Error:', error);
      await this.showWarningToast('SCAN.ERROR_TEXT');
    } finally {
      this.isProcessing = false;
    }
  }

  // Open file
  async openFile(fileUrl: string, mimeType: string) {
    const fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);
    const filePath = Capacitor.getPlatform() === 'android' ? this.file.externalDataDirectory : this.file.documentsDirectory;

    this.fileTransfer.download(fileUrl, filePath + fileName).then((entry) => {
      this.fileOpener.open(entry.toURL(), mimeType)
        .then(() => console.log('File is opened'))
        .catch((error) => console.error('Error opening file:', error));
    }).catch((error) => {
      console.error('Error downloading file:', error);
    });
  }

  // Get file extension 
  getFileExtension(fileUrl: string | undefined | null): string | null {
    return fileUrl ? fileUrl.split('.').pop()?.toLowerCase() || null : null;
  }

  // Toasts
  async showWarningToast(messageKey: string) {
    const toast = await this.toastController.create({
      message: this.translate.instant(messageKey),
      duration: 3000, // Show for 3 seconds
      position: 'middle',
      cssClass: 'warning-toast',
      color: 'danger'
    });
    await toast.present();
  }

  async showInfoToast(messageKey: string) {
    const toast = await this.toastController.create({
      message: this.translate.instant(messageKey),
      duration: 2000,
      position: 'middle',
      cssClass: 'info-toast',
    });
    await toast.present();
  }
}