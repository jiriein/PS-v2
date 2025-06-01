import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { ActionSheetController, Platform, ToastController, NavController } from '@ionic/angular';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { RegulationPatternService } from '../services/regulation-pattern.service';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { FileChooser } from '@awesome-cordova-plugins/file-chooser/ngx';
import { FileOpener } from '@awesome-cordova-plugins/file-opener/ngx';
import { ZakonyApiService } from '../services/zakony-api.service';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { TranslateService } from '@ngx-translate/core';
import { createWorker, Worker } from 'tesseract.js';
import Quill, { QuillOptions } from 'quill';
import { Capacitor } from '@capacitor/core';
import { Router } from '@angular/router';
import * as pdfjsLib from 'pdfjs-dist';
import { saveAs } from 'file-saver';
import * as mammoth from 'mammoth';
import * as JSZip from 'jszip';


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
  isNative: boolean = Capacitor.getPlatform() !== 'web';
  imageUrl: string | undefined;
  isProcessing: boolean = false;
  private tesseractWorker: Worker | undefined;
  @ViewChild('editor', { static: false }) editorElement!: ElementRef;
  quillEditor: Quill | undefined;
  recognizedText: string | undefined = '';
  matches: { text: string; start: number; end: number; standardized?: string }[] = [];
  apiResults: { standardized: string; result?: any; error?: string; highlightColor?: string }[] = [];
  highlightMode: 'full' | 'number' = 'full';
  
  constructor(
    private fileChooser: FileChooser,
    private actionSheetCtrl: ActionSheetController,
    private toastController: ToastController,
    private translate: TranslateService,
    private platform: Platform,
    private fileOpener: FileOpener,
    private cdr: ChangeDetectorRef,
    private zakonyApiService: ZakonyApiService,
    private regulationPatternService: RegulationPatternService,
    private navCtrl: NavController,
    private router: Router
  ) {
    const pdfjsLibTyped = pdfjsLib as typeof pdfjsLib & { GlobalWorkerOptions: { workerSrc: string } };
    pdfjsLibTyped.GlobalWorkerOptions.workerSrc = this.getWorkerSrc();
  }

  ngAfterViewInit() {
    console.log('ngAfterViewInit - Editor element:', this.editorElement); // Debug log
    this.initializeQuillEditor();
    this.cdr.detectChanges();
  }

  private initializeQuillEditor() {
    if (this.editorElement && this.editorElement.nativeElement) {
      const toolbarOptions = [
        ['bold', 'italic', 'underline'],
        [{ 'background': [] }],
        ['link'],
        ['clean'],
        [{ 'header': [1, 2, 3, false] }],
        [{ 'toggle-highlight': 'toggle-highlight' }]
      ];
      this.quillEditor = new Quill(this.editorElement.nativeElement, {
        theme: 'snow',
        modules: {
          toolbar: {
            container: toolbarOptions,
            handlers: {
              'toggle-highlight': () => this.toggleHighlightMode()
            }
          }
        },
        placeholder: this.translate.instant('SCAN.EDIT_TEXT')
      } as QuillOptions);
      if (this.recognizedText) {
        this.setEditorContent(this.recognizedText);
      }
      this.quillEditor.root.addEventListener('click', (event: Event) => {
        const target = event.target as HTMLElement;
        if (target.tagName === 'A' && target.getAttribute('href')) {
          event.preventDefault();
          const href = target.getAttribute('href')!;
          console.log('Link clicked:', href); // Debug log
          this.handleRegulationClick(href);
        }
      });
      this.quillEditor.on('text-change', () => {
        const delta = (this.quillEditor as Quill).getContents();
        this.recognizedText = delta.ops
          .filter(op => typeof op.insert === 'string')
          .map(op => op.insert)
          .join('')
          .trim();
      });
      console.log('Quill editor initialized:', this.quillEditor); // Debug log
    } else {
      console.error('Editor element not found');
    }
  }

  // Helper method to set editor content, handling plain text or HTML
  private setEditorContent(text: string) {
    if (!this.quillEditor) return;
    const isHtml = /<[a-z][\s\S]*>/i.test(text);
    if (isHtml) {
      (this.quillEditor as Quill).clipboard.dangerouslyPasteHTML(text);
    } else {
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      const delta = lines.map(line => ({ insert: line + '\n' }));
      console.log('setEditorContent delta:', delta); // Debug log
      (this.quillEditor as Quill).setContents(delta);
    }
  }

  // Update text from editor
  updateText() {
    if (this.quillEditor) {
      this.recognizedText = this.quillEditor.root.innerHTML;
    }
  }

  private updateEditorText(text: string) {
    console.log('updateEditorText input:', text); // Debug log
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
      const doc = new Document({
        sections: [{ properties: {}, children: this.parseHtmlToDocx((this.quillEditor as Quill).root.innerHTML)}]
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
        console.log('DOCX saved to:', fileName); // Debug log
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
        console.log('DOCX downloaded:', fileName); // Debug log
        await this.showInfoToast('SCAN.SUCCESS_SAVED');
      }
    } catch (error) {
      console.error('Error saving DOCX file:', error); // Debug log
      await this.showWarningToast('SCAN.ERROR_SAVED');
    }
  }

  // Helper method to convert HTML to DOCX paragraphs
  private parseHtmlToDocx(html: string): Paragraph[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const paragraphs: Paragraph[] = [];
    // Process each paragraph or other elements
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
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const runProps: any = { text: el.textContent || '' };
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
            console.log('Background color detected, not fully supported in DOCX'); // Debug log
          }
          if (el.tagName === 'A') {
            runProps.text = `${el.textContent} (${el.getAttribute('href')})`;
          }
          if (runProps.text.trim()) {
            textRuns.push(new TextRun(runProps));
          }
        }
      };
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

    // Helper method to convert base64 to ArrayBuffer
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private getWorkerSrc(): string {
    if (Capacitor.getPlatform() === 'web') {
      return '/assets/pdf.worker.min.mjs';
    } else {
      return Capacitor.convertFileSrc('public/assets/pdf.worker.js');
    }
  }

  async ngOnInit() {
    try {
      this.tesseractWorker = await createWorker('ces', 1, {
        logger: (m) => console.log(m) // Debug log
      });
      console.log('Tesseract worker initialized'); // Debug log
    } catch (error) {
      console.error('Failed to initialize Tesseract worker:', error);
      await this.showWarningToast('SCAN.ERROR_TEXT');
    }
  }

  async ngOnDestroy() {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
    }
  }

  // Native-only scan with camera
  async scanWithCamera() {
    if (!this.isNative) return;
    try {
      const image = await Camera.getPhoto({
        quality: 100,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera
      });
      this.imageUrl = image.dataUrl;
      console.log('Image captured from Camera:', this.imageUrl); // Debug log
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
        quality: 100,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos
      });
      this.imageUrl = image.dataUrl;
      console.log('Image selected from Gallery:', this.imageUrl); // Debug log
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
    const hasPermission = await this.requestStoragePermissions();
    if (!hasPermission) {
      await this.showWarningToast('SCAN.NO_STORAGE_PERMISSION');
      return;
    }
    try {
      const uri = await this.fileChooser.open();
      console.log('Selected file URI:', uri); // Debug log
      const fileExtension = this.getFileExtension(uri);
      console.log('Selected file extension:', fileExtension); // Debug log
      if (!fileExtension) {
        await this.showWarningToast('SCAN.UNSUPPORTED_FILE_TYPE');
        return;
      }
      if (['png', 'jpg', 'jpeg'].includes(fileExtension)) {
        const fileData = await Filesystem.readFile({
          path: uri,
          directory: Directory.External
        });
        this.imageUrl = `data:image/${fileExtension};base64,${fileData.data}`;
        console.log('Image selected for OCR:', this.imageUrl); // Debug log
        await this.showInfoToast('SCAN.SUCCESS_IMAGE');
      } else {
        const fileContent = await this.readFileContent(uri, fileExtension);
        this.updateEditorText(fileContent || 'Failed to extract text from the file.');
        console.log('Text extracted:', this.recognizedText); // Debug log
        await this.showInfoToast('SCAN.SUCCESS_TEXT');
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
    console.log('Selected file:', file); // Debug log
    const fileExtension = this.getFileExtension(file.name);
    if (!fileExtension) {
      await this.showWarningToast('SCAN.UNSUPPORTED_FILE_TYPE');
      return;
    }
    if (['png', 'jpg', 'jpeg'].includes(fileExtension)) {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      this.imageUrl = fileData;
      console.log('Image selected for OCR:', this.imageUrl); // Debug log
      await this.showInfoToast('SCAN.SUCCESS_IMAGE');
    } else {
      const fileContent = await this.readWebFileContent(file, fileExtension);
        this.updateEditorText(fileContent || 'Failed to extract text from the file.');
        console.log('Text extracted:', this.recognizedText); // Debug log
        await this.showInfoToast('SCAN.SUCCESS_TEXT');
    }
  }

  // Read file content (native)
  async readFileContent(fileUrl: string, extension: string): Promise<string> {
    try {
      console.log('Reading file content for extension:', extension);  // Debug log
      switch (extension) {
        case 'pdf': return await this.extractTextFromPDF(fileUrl);
        case 'txt': return await this.extractTextFromTXT(fileUrl);
        case 'docx': return await this.extractTextFromDOCX(fileUrl);
        case 'odt': return await this.extractTextFromODT(fileUrl);
        default:
          console.log('Unsupported file extension:', extension);  // Debug log
          return 'Unsupported file type.';
      }
    } catch (error) {
      console.error(`Error reading ${extension} file:`, error);
      await this.showWarningToast('SCAN.ERROR_TEXT');
      return 'Error reading file content.';
    }
  }

  // Read file content (web)
  async readWebFileContent(file: File, extension: string): Promise<string> {
    try {
      switch (extension) {
        case 'pdf': return await this.extractTextFromPDFWeb(file);
        case 'txt': return await this.extractTextFromTXTWeb(file);
        case 'docx': return await this.extractTextFromDOCXWeb(file);
        case 'odt': return await this.extractTextFromODTWeb(file);
        default:
          console.log('Unsupported file extension:', extension);  // Debug log
          return 'Unsupported file type.';
      }
    } catch (error) {
      console.error(`Error reading ${extension} file:`, error);
      await this.showWarningToast('SCAN.ERROR_TEXT');
      return 'Error reading file content.';
    }
  }

  // Extract text from PDF (native)
  async extractTextFromPDF(fileUrl: string): Promise<string> {
    try {
      const fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1) || `pdf-${Date.now()}.pdf`;
      const targetPath = `${Directory.Temporary}/${fileName}`;
      await Filesystem.copy({
        from: fileUrl,
        to: fileName,
        toDirectory: Directory.Temporary
      });
      const result = await Filesystem.readFile({
        path: fileName,
        directory: Directory.Temporary
      });
      const arrayBuffer = this.base64ToArrayBuffer(result.data as string);
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
      return 'Failed to extract text from PDF.';
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
      return 'Failed to extract text from PDF.';
    }
  }

  // Extract text from TXT (native)
  async extractTextFromTXT(fileUrl: string): Promise<string> {
    try {
      const result = await Filesystem.readFile({
        path: fileUrl,
        directory: Directory.External,
        encoding: Encoding.UTF8
      });
      return result.data as string;
    } catch (error) {
      console.error('Failed to extract text from TXT:', error);
      return 'Failed to extract text from TXT.';
    }
  }

  // Extract text from TXT (web)
  async extractTextFromTXTWeb(file: File): Promise<string> {
    try{
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
      });
    } catch (error) {
      console.error('Failed to extract text from TXT (web):', error);
      return 'Failed to extract text from TXT.';

    }
  }

  // Extract text from DOCX (native)
  async extractTextFromDOCX(fileUrl: string): Promise<string> {
    try {
      const result = await Filesystem.readFile({
        path: fileUrl,
        directory: Directory.External
      });
      const arrayBuffer = this.base64ToArrayBuffer(result.data as string);
      const mammothResult = await mammoth.extractRawText({ arrayBuffer });
      return mammothResult.value;
    } catch (error) {
      console.error('Failed to extract text from DOCX:', error);
      return 'Failed to extract text from DOCX.';
    }
  }

  // Extract text from DOCX (web)
  async extractTextFromDOCXWeb(file: File): Promise<string> {
    try {
      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } catch (error) {
      console.error('Failed to extract text from DOCX (web):', error);
      return 'Failed to extract text from DOCX.';
    }
  }

  // Extract text from ODT (native)
  async extractTextFromODT(fileUrl: string): Promise<string> {
    try {
      const fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1) || `odt-${Date.now()}.odt`;
      const targetPath = `${Directory.Temporary}/${fileName}`;
      await Filesystem.copy({
        from: fileUrl,
        to: fileName,
        toDirectory: Directory.Temporary
      });
      const result = await Filesystem.readFile({
        path: fileName,
        directory: Directory.Temporary
      });
      const arrayBuffer = this.base64ToArrayBuffer(result.data as string);
      const zip = await JSZip.loadAsync(arrayBuffer);
      const contentXml = await zip.file('content.xml')?.async('string');
      if (!contentXml) throw new Error('No content.xml found in ODT');
      const text = contentXml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      return text;
    } catch (error) {
      console.error('Failed to extract text from ODT:', error);
      return 'Failed to extract text from ODT.';
    }
  }

  // Extract text from ODT (web)
  async extractTextFromODTWeb(file: File): Promise<string> {
    try {
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
    } catch (error) {
      console.error('Failed to extract text from ODT (web):', error);
      return 'Failed to extract text from ODT.';
    }
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
      console.log('Recognized Text:', this.recognizedText); // Debug log
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
    try {
      const fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1) || `file-${Date.now()}`;
      const targetPath = `${Directory.Documents}/${fileName}`;
      await Filesystem.copy({
        from: fileUrl,
        to: fileName,
        toDirectory: Directory.Documents
      });
      const fileUri = await Filesystem.getUri({
        path: fileName,
        directory: Directory.Documents
      });

      await this.fileOpener.open(fileUri.uri, mimeType);
      console.log('File opened successfully:', fileUri.uri); // Debug log
    } catch (error: any) {
      console.error('Error opening file:', error);
      if (error.message.includes('No Activity found')) {
        await this.showWarningToast('SCAN.NO_APP_FOUND');
      } else {
        await this.showWarningToast('SCAN.ERROR_OPENING_FILE');
      }
    }
  }

  // Get file extension
  getFileExtension(fileUrl: string | undefined | null): string | null {
    return fileUrl ? fileUrl.split('.').pop()?.toLowerCase() || null : null;
  }

  // Request storage permissions
  async requestStoragePermissions() {
    try {
      const permission = await Filesystem.requestPermissions();
      console.log('Storage permission status:', permission);
      return permission.publicStorage === 'granted';
    } catch (error) {
      console.error('Error requesting storage permissions:', error);
      return false;
    }
  }

  // Find regulation patterns
  async findRegulationPatterns() {
    if (!this.recognizedText) {
      await this.showWarningToast('SCAN.NO_TEXT');
      return;
    }
    this.matches = this.highlightMode === 'full'
      ? this.regulationPatternService.findRegulationPatterns(this.recognizedText)
      : this.regulationPatternService.findLawNumbers(this.recognizedText);
    console.log('Found matches:', this.matches); // Debug log
    if (this.matches.length === 0) {
      await this.showWarningToast('SCAN.NO_PATTERNS_FOUND');
      return;
    } else {
      this.matches = this.matches.map(match => {
        if (match.standardized) {
          const normalizedStandardized = this.normalizeYear(match.standardized);
          return { ...match, standardized: normalizedStandardized };
        }
        return match;
      });
      console.log('Matches after normalization:', this.matches); // Debug log
      await this.showInfoToast('SCAN.PATTERNS_FOUND');
      await this.fetchApiResults();
      this.highlightMatches();
    }
  }

  async navigateToDetail(match: { text: string; start: number; end: number; standardized?: string }) {
    if (!match.standardized) return;

    const parsed = this.zakonyApiService.parseStandardizedText(match.standardized);
    const { collection, document } = parsed;

    if (collection && document) {
      try {
        const observable = await this.zakonyApiService.getDocData(collection, document);
        const result = await new Promise((resolve, reject) => {
          observable.subscribe({
            next: (data) => resolve(data),
            error: (err) => reject(err),
          });
        });

        const numberMatch = match.standardized.match(/(\d{1,4}\/\d{2,4})/);
        const lawNumber = numberMatch ? numberMatch[1] : match.standardized;

        await this.router.navigate([`/document-detail/${collection}/${document}`], {
          state: { result, lawNumber }
        });
      } catch (error) {
        console.warn(`Failed to fetch API result for "${match.standardized}":`, error);
      }
    }
  }

  // Helper to normalize year based on digit count and value
  private normalizeYear(standardized: string): string {
    const slashIndex = standardized.indexOf('/');
    if (slashIndex === -1) return standardized;
    const yearPart = standardized.substring(slashIndex + 1).split(' ')[0];
    const year = parseInt(yearPart, 10);
    if (yearPart.length === 4) {
      return standardized.toLowerCase();
    } else if (yearPart.length === 2) {
      // Normalize 2-digit year to 4-digit
      const prefix = standardized.substring(0, slashIndex + 1);
      const suffix = standardized.substring(slashIndex + 1 + yearPart.length).toLowerCase();
      const newYear = year > 70 ? `19${year}` : `20${year}`;
      return `${prefix}${newYear}${suffix}`.toLowerCase();
    }
    return standardized.toLowerCase();
  }

  private async fetchApiResults() {
    this.isProcessing = true;
    this.apiResults = await Promise.all(this.matches.map(async (match) => {
      if (match.standardized) {
        try {
          const observable = await this.zakonyApiService.getDocHead(match.standardized);
          const result = await new Promise((resolve, reject) => {
            observable.subscribe({
              next: (data) => resolve(data),
              error: (err) => reject(err),
            });
          });
          const highlightColor = this.determineHighlightColor(result);
          return { standardized: match.standardized, result, highlightColor };
        } catch (error: any) {
          console.warn(`Error fetching API for "${match.standardized}":`, error);
          return { standardized: match.standardized, error: error.message, highlightColor: 'gray' };
        }
      }
      return { standardized: match.standardized || '', highlightColor: 'gray' };
    }));
    this.isProcessing = false;
    console.log('API results:', this.apiResults);
  }

  private determineHighlightColor(result: any): string {
    const effectFrom = result?.EffectFrom;
    const effectTill = result?.EffectTill;
    if (!effectFrom) {
      return 'gray';
    }
    const fromMatch = effectFrom.match(/\/Date\((\d+)([+-]\d{4})\)\//);
    if (!fromMatch) {
      return 'gray';
    }
    const timestamp = parseInt(fromMatch[1], 10);
    const fromDate = new Date(timestamp);
    const currentDate = new Date();
    if (effectTill === null && fromDate <= currentDate) {
      return 'green';
    }
    if (effectTill) {
      const tillMatch = effectTill.match(/\/Date\((\d+)([+-]\d{4})\)\//);
      if (tillMatch) {
        const tillTimestamp = parseInt(tillMatch[1], 10);
        const tillDate = new Date(tillTimestamp);
        if (tillDate < currentDate) {
          return 'red'; 
        }
      }
    }
    return 'gray';
  }

  highlightMatches() {
    if (!this.quillEditor || !this.matches.length || !this.apiResults.length) {
      console.warn('Cannot highlight: Quill editor, matches, or API results not available');
      return;
    }
    // Clear existing highlights
    this.quillEditor.formatText(0, this.recognizedText?.length || 0, { background: false, link: null });

    // Apply highlights with correct colors and links
    this.matches.forEach(match => {
      if (match.standardized) {
        const apiResult = this.apiResults.find(r => r.standardized === match.standardized);
        const highlightColor = apiResult?.highlightColor || 'gray';
        const parsed = this.zakonyApiService.parseStandardizedText(match.standardized);
        const { collection, document } = parsed;
        if (document) {
          let start: number = match.start;
          let length: number = match.end - match.start;

          // Only adjust the highlight range to the number part if in 'number' mode
          if (this.highlightMode === 'number') {
            const numberMatch = match.text.match(/(\d{1,4}\/\d{2,4})/);
            const numberText = numberMatch ? numberMatch[0] : match.text;
            const startOffset = match.text.indexOf(numberText);
            const endOffset = startOffset + numberText.length;
            start = match.start + startOffset;
            length = endOffset - startOffset;
          }
          this.quillEditor!.formatText(
            start,
            length,
            { background: highlightColor, link: document ? `/document-detail/${collection}/${document}` : null }
          );
        }
      }
    });
  }

  private toggleHighlightMode() {
    this.highlightMode = this.highlightMode === 'full' ? 'number' : 'full';
    console.log('Highlight mode switched to:', this.highlightMode);
    const toggleButton = document.querySelector('.ql-toggle-highlight');
    if (toggleButton) {
      if (this.highlightMode === 'number') {
        toggleButton.classList.add('ql-active');
      } else {
        toggleButton.classList.remove('ql-active');
      }
    }
    this.updateHighlights();
  }
  
  private updateHighlights() {
    if (this.recognizedText) {
      this.findRegulationPatterns();
    }
  }

  private async handleRegulationClick(url: string) {
    const match = url.match(/\/document-detail\/([^\/]+)\/([^\/]+)/);
    if (match) {
      const [, collection, document] = match;
      const standardizedMatch = this.matches.find(m => {
        const parsed = this.zakonyApiService.parseStandardizedText(m.standardized || '');
        return parsed.collection === collection && parsed.document === document;
      });
      const standardized = standardizedMatch?.standardized || '';
      try {
        this.isProcessing = true;
        console.log('Fetching document data for:', { collection, document }); // Debug log
        const observable = await this.zakonyApiService.getDocData(collection, document);
        const result = await new Promise((resolve, reject) => {
          observable.subscribe({
            next: (data) => resolve(data),
            error: (err) => reject(err),
          });
        });
        const highlightColor = this.determineHighlightColor(result);
        console.log('API result before navigation:', result); // Detailed log
        console.log('Navigating to document detail with data:', { result, highlightColor, standardized }); // Debug log
        await this.router.navigate([`/document-detail/${collection}/${document}`], {
          state: { result, highlightColor, standardized }
        });
      } catch (error) {
        console.warn(`Failed to fetch API result for "${standardized}":`, error);
        await this.showWarningToast('SCAN.ERROR_API');
      } finally {
        this.isProcessing = false;
      }
    } else {
      console.error('Invalid URL format:', url);
      await this.showWarningToast('SCAN.INVALID_LINK');
    }
  }

  // Toasts
  async showWarningToast(messageKey: string) {
    const toast = await this.toastController.create({
      message: this.translate.instant(messageKey),
      duration: 3000,
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