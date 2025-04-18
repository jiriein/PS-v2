import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ActionSheetController, Platform, ToastController } from '@ionic/angular';
import { File as CordovaFile } from '@awesome-cordova-plugins/file/ngx';
import { FileOpener } from '@awesome-cordova-plugins/file-opener/ngx';
import { FileChooser } from '@awesome-cordova-plugins/file-chooser/ngx';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { FileTransfer, FileTransferObject } from '@awesome-cordova-plugins/file-transfer/ngx';
import { TranslateService } from '@ngx-translate/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { createWorker, Worker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';
import * as JSZip from 'jszip';

@Component({
  selector: 'app-scan',
  templateUrl: './scan.page.html',
  styleUrls: ['./scan.page.scss'],
  standalone: false
})
export class ScanPage implements OnInit, OnDestroy {
  fileTransfer: FileTransferObject;
  isNative: boolean = Capacitor.getPlatform() !== 'web';
  imageUrl: string | undefined; // Store image Data URL for display and OCR
  recognizedText: string | undefined; // Store OCR result
  isProcessing: boolean = false; // Track OCR processing state
  private tesseractWorker: Worker | undefined; // Tesseract.js worker

  constructor(
    private fileChooser: FileChooser,
    private actionSheetCtrl: ActionSheetController,
    private toastController: ToastController,
    private translate: TranslateService,
    private platform: Platform,
    private fileOpener: FileOpener,
    private transfer: FileTransfer,
    @Inject(CordovaFile) private file: CordovaFile
  ) {
    this.fileTransfer = this.transfer.create();
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdf.worker.min.js';
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
          this.recognizedText = fileContent;
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
        this.recognizedText = fileContent;
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
  // Download file to temporary storage
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
}

// Extract text from PDF (web)
async extractTextFromPDFWeb(file: File): Promise<string> {
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
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    odt: 'application/vnd.oasis.opendocument.text',
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
      this.recognizedText = result.data.text; // Text with new lines and tabs preserved
      console.log('Recognized Text:', this.recognizedText);
      await this.showInfoToast('SCAN.SUCCESS_TEXT');
    } catch (error) {
      console.error('OCR Error:', error);
      await this.showWarningToast('SCAN.ERROR_TEXT');
    } finally {
      this.isProcessing = false;
    }
  }

  // Save text to a file
  async saveTextToFile() {
    if (!this.recognizedText) {
      await this.showWarningToast('SCAN.NO_TEXT');
      return;
    }

    const fileName = `recognized-text-${Date.now()}.txt`;
    try {
      await Filesystem.writeFile({
        path: fileName,
        data: this.recognizedText,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });
      console.log('Text saved to:', fileName);
      await this.showInfoToast('SCAN.SUCCESS_SAVED');
      
      // Optionally open the file (native only)
      if (this.isNative) {
        const filePath = await Filesystem.getUri({
          path: fileName,
          directory: Directory.Documents
        });
        await this.fileOpener.open(filePath.uri, 'text/plain');
      }
    } catch (error) {
      console.error('Error saving text to file:', error);
      await this.showWarningToast('SCAN.ERROR_SAVED');
    }
  }

  // Update text from textarea
  updateText(event: Event) {
    const input = event.target as HTMLTextAreaElement;
    this.recognizedText = input.value;
  }

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

  getFileExtension(fileUrl: string | undefined | null): string | null {
    return fileUrl ? fileUrl.split('.').pop()?.toLowerCase() || null : null;
  }

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
      color: 'primary'
    });
    await toast.present();
  }

}