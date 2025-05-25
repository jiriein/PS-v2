import { Component, OnInit, OnDestroy, Inject, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { ActionSheetController, Platform, ToastController, NavController } from '@ionic/angular';
import { FileTransfer, FileTransferObject } from '@awesome-cordova-plugins/file-transfer/ngx';
import { RegulationPatternService } from '../services/regulation-pattern.service';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { File as CordovaFile } from '@awesome-cordova-plugins/file/ngx';
import { FileChooser } from '@awesome-cordova-plugins/file-chooser/ngx';
import { FileOpener } from '@awesome-cordova-plugins/file-opener/ngx';
import { ZakonyApiService } from '../services/zakony-api.service';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { TranslateService } from '@ngx-translate/core';
import { createWorker, Worker } from 'tesseract.js';
import Quill, { QuillOptions } from 'quill';
import { Capacitor } from '@capacitor/core';
import * as pdfjsLib from 'pdfjs-dist';
import { saveAs } from 'file-saver';
import * as mammoth from 'mammoth';
import * as JSZip from 'jszip';

// Define interface for Quill toolbar module
interface QuillToolbar {
  addHandler(event: string, callback: (value: string) => void): void;
}

@Component({
  selector: 'app-scan',
  templateUrl: './scan.page.html',
  styleUrls: ['./scan.page.scss'],
  standalone: false,
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
  matches: { text: string; start: number; end: number; standardized?: string }[] = [];
  apiResults: { standardized: string; result?: any; error?: string; highlightColor?: string }[] = [];

  constructor(
    private fileChooser: FileChooser,
    private actionSheetCtrl: ActionSheetController,
    private toastController: ToastController,
    private translate: TranslateService,
    private platform: Platform,
    private fileOpener: FileOpener,
    private transfer: FileTransfer,
    @Inject(CordovaFile) private file: CordovaFile,
    private cdr: ChangeDetectorRef,
    private zakonyApiService: ZakonyApiService,
    private regulationPatternService: RegulationPatternService,
    private navCtrl: NavController
  ) {
    this.fileTransfer = this.transfer.create();
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = this.getWorkerSrc();
  }


  ngAfterViewInit() {
    console.log('ngAfterViewInit - Editor element:', this.editorElement); //Debug log
    this.initializeQuillEditor();
    this.cdr.detectChanges();
  }

  private initializeQuillEditor() {
    if (this.editorElement && this.editorElement.nativeElement) {
      const toolbarOptions = [
        ['bold', 'italic', 'underline'],
        [{ 'background': [] }], // Highlighting
        ['link'], // Hyperlink
        ['clean'] // Remove formatting
      ];
      this.quillEditor = new Quill(this.editorElement.nativeElement, {
        theme: 'snow',
        modules: {
          toolbar: toolbarOptions
        },
        placeholder: this.translate.instant('SCAN.EDIT_TEXT')
      } as QuillOptions);

      // Set initial text if recognizedText exists
      if (this.recognizedText) {
        this.setEditorContent(this.recognizedText);
      }

      // Add toolbar link handler
      const toolbar = this.quillEditor.getModule('toolbar') as QuillToolbar;
      toolbar.addHandler('link', (value: string) => {
        if (value && this.quillEditor) {
          this.navCtrl.navigateForward(value);
        }
      });

      // Update recognizedText when editor content changes
      this.quillEditor.on('text-change', () => {
        // Update recognizedText as plain text
        const delta = (this.quillEditor as Quill).getContents();
        this.recognizedText = delta.ops
          .filter(op => typeof op.insert === 'string')
          .map(op => op.insert)
          .join('')
          .trim();
      });
      console.log('Quill editor initialized:', this.quillEditor); //Debug log
    } else {
      console.error('Editor element not found');
    }
  }

  // Helper method to set editor content, handling plain text or HTML
  private setEditorContent(text: string) {
    if (!this.quillEditor) return;

    // Check if the text is HTML by looking for common tags
    const isHtml = /<[a-z][\s\S]*>/i.test(text);
    if (isHtml) {
      // If HTML, use pasteHTML to render it correctly
      (this.quillEditor as Quill).clipboard.dangerouslyPasteHTML(text);
    } else {
      // If plain text, convert to Delta format with line breaks
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      const delta = lines.map(line => ({
        insert: line + '\n'
      }));
      console.log('setEditorContent delta:', delta); //Debug log
      (this.quillEditor as Quill).setContents(delta);
    }
  }

  // Update text from editor (optional, for manual updates)
  updateText() {
    if (this.quillEditor) {
      this.recognizedText = this.quillEditor.root.innerHTML;
    }
  }

  private updateEditorText(text: string) {
    console.log('updateEditorText input:', text); //Debug log
    this.recognizedText = text;
    if (this.quillEditor && text) {
      this.setEditorContent(text);
    } else if (!this.quillEditor && this.editorElement && this.editorElement.nativeElement) {
      this.initializeQuillEditor();
      if (this.quillEditor && text) {
        this.setEditorContent(text);
      }
    }
    this.cdr.detectChanges();
  }

  // Save text to a file
  async saveTextToFile() {
    if (!this.recognizedText) {
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
            children: this.parseHtmlToDocx((this.quillEditor as Quill).root.innerHTML)
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
        console.log('DOCX saved to:', fileName); //Debug log
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
        console.log('DOCX downloaded:', fileName); //Debug log
        await this.showInfoToast('SCAN.SUCCESS_SAVED');
      }
    } catch (error) {
      console.error('Error saving DOCX file:', error);  //Debug log
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
          const text = node.textContent || '';
          if (text.trim()) {
            textRuns.push(new TextRun({ text }));
          }
        }else if (node.nodeType === Node.ELEMENT_NODE) {
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
            console.log('Background color detected, not fully supported in DOCX'); //Debug log
          }
          if (el.tagName === 'A') {
            runProps.text = `${el.textContent} (${el.getAttribute('href')})`; // Include link as text
          }

          if (runProps.text.trim()) {
            textRuns.push(new TextRun(runProps));
          }
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
      console.log('Tesseract worker initialized'); //Debug log
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
      console.log('Image captured from Camera:', this.imageUrl); //Debug log
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
      console.log('Image selected from Gallery:', this.imageUrl); //Debug log
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
      console.log('Selected file extension:', fileExtension); //Debug log
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
        console.log('Image selected for OCR:', this.imageUrl); //Debug log
        await this.showInfoToast('SCAN.SUCCESS_IMAGE');
      } else {
        // Handle text-based files
        const fileContent = await this.readFileContent(fileUrl, fileExtension);
        if (fileContent) {
          this.updateEditorText(fileContent);
          console.log('Text extracted:', this.recognizedText); //Debug log
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
    console.log('Selected file:', file); //Debug log
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
      console.log('Image selected for OCR:', this.imageUrl); //Debug log
      await this.showInfoToast('SCAN.SUCCESS_IMAGE');
    } else {
      // Handle text-based files
      const fileContent = await this.readWebFileContent(file, fileExtension);
      if (fileContent) {
        this.updateEditorText(fileContent);
        console.log('Text extracted:', this.recognizedText); //Debug log
        await this.showInfoToast('SCAN.SUCCESS_TEXT');
      } else {
        const fileUrl = URL.createObjectURL(file);
        await this.openFile(fileUrl, this.getMimeType(fileExtension));
        await this.showWarningToast('SCAN.UNSUPPORTED_FILE_TYPE');
      }
    }
  }

// Read file content (native)
async readFileContent(fileUrl: string, extension: string): Promise<string | null> {
  try {
    console.log('Reading file content for extension:', extension);  //Debug log
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
        console.log('Unsupported file extension:', extension);  //Debug log
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
        console.log('Unsupported file extension:', extension);  //Debug log
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
      console.log('Recognized Text:', this.recognizedText); //Debug log
      await this.showInfoToast('SCAN.SUCCESS_TEXT');
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
        .then(() => console.log('File is opened')) //Debug log
        .catch((error) => console.error('Error opening file:', error));
    }).catch((error) => {
      console.error('Error downloading file:', error);
    });
  }

  // Get file extension 
  getFileExtension(fileUrl: string | undefined | null): string | null {
    return fileUrl ? fileUrl.split('.').pop()?.toLowerCase() || null : null;
  }

  // Find regulation patterns
  async findRegulationPatterns() {
    if (!this.recognizedText) {
      await this.showWarningToast('SCAN.NO_TEXT');
      return;
    }

    this.matches = this.regulationPatternService.findRegulationPatterns(this.recognizedText);
    console.log('Found matches:', this.matches);

    if (this.matches.length === 0) {
      await this.showWarningToast('SCAN.NO_PATTERNS_FOUND');
    } else {
      await this.showInfoToast('SCAN.PATTERNS_FOUND');
      this.highlightMatches(); // Initial gray highlights
      await this.fetchApiResults(); // Fetch API results and update highlights
    }
  }

  private async fetchApiResults() {
    this.apiResults = [];
    this.isProcessing = true;

    for (const match of this.matches) {
      if (!match.standardized) continue;
      let highlightColor = 'gray'; // Default
      try {
        const result = await this.zakonyApiService.getDocHead(match.standardized).toPromise();
        highlightColor = this.determineHighlightColor(result);
        this.apiResults.push({ standardized: match.standardized, result, highlightColor });
      } catch (error: any) {
        this.apiResults.push({
          standardized: match.standardized,
          error: error.message || 'Failed to fetch data',
          highlightColor,
        });
      }
    }

    this.isProcessing = false;
    console.log('API results:', this.apiResults);
    this.highlightMatches(); // Re-highlight based on API results
    this.cdr.detectChanges();
  }

  private determineHighlightColor(result: any): string {
    const effectFrom = result?.EffectFrom;
    const effectTill = result?.EffectTill;

    if (!effectFrom) {
      return 'gray'; // No valid dates
    }

    // Parse EffectFrom (e.g., "/Date(1167606000000+0100)/")
    const fromMatch = effectFrom.match(/\/Date\((\d+)([+-]\d{4})\)\//);
    if (!fromMatch) {
      return 'gray'; // Invalid date format
    }

    const timestamp = parseInt(fromMatch[1], 10);
    const fromDate = new Date(timestamp);

    const currentDate = new Date();

    // Check if regulation is effective
    if (effectTill === null && fromDate <= currentDate) {
      return 'green'; // Currently effective
    }

    // Parse EffectTill if present
    if (effectTill) {
      const tillMatch = effectTill.match(/\/Date\((\d+)([+-]\d{4})\)\//);
      if (tillMatch) {
        const tillTimestamp = parseInt(tillMatch[1], 10);
        const tillDate = new Date(tillTimestamp);
        if (tillDate < currentDate) {
          return 'red'; // No longer effective
        }
      }
    }

    return 'gray'; // Default for other cases (e.g., future dates, invalid Till)
  }

  highlightMatches() {
    if (!this.quillEditor || !this.matches.length) {
      console.warn('Cannot highlight: Quill editor or matches not available');
      return;
    }

    // Clear existing highlights
    this.quillEditor.formatText(0, this.recognizedText?.length || 0, { background: false, link: false });

    // Apply highlights based on apiResults or default to gray
    this.matches.forEach(match => {
      const apiResult = this.apiResults.find(r => r.standardized === match.standardized);
      const color = apiResult?.highlightColor || 'gray';
      let collection = 'cs';
      let document = '';
      if (match.standardized) {
        const parsed = this.zakonyApiService.parseStandardizedText(match.standardized);
        collection = parsed.collection;
        document = parsed.document;
      }
      this.quillEditor!.formatText(match.start, match.end - match.start, {
        background: color,
        link: `/document-detail/${collection}/${document}`
      });
    });
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