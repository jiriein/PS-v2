import { Component, OnInit, OnDestroy } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ActionSheetController, Platform, ToastController } from '@ionic/angular';
import { File } from '@awesome-cordova-plugins/file/ngx';
import { FileOpener } from '@awesome-cordova-plugins/file-opener/ngx';
import { FileChooser } from '@awesome-cordova-plugins/file-chooser/ngx';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { FileTransfer, FileTransferObject } from '@awesome-cordova-plugins/file-transfer/ngx';
import { TranslateService } from '@ngx-translate/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { createWorker, Worker } from 'tesseract.js';

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
    private file: File
  ) {
    this.fileTransfer = this.transfer.create();
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
        switch (fileExtension) {
          case 'pdf':
            await this.openFile(fileUrl, 'application/pdf');
            break;
          case 'txt':
            await this.openFile(fileUrl, 'text/plain');
            break;
          case 'docx':
            await this.openFile(fileUrl, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            break;
          case 'odt':
            await this.openFile(fileUrl, 'application/vnd.oasis.opendocument.text');
            break;
          default:
            await this.showWarningToast('SCAN.UNSUPPORTED_FILE_TYPE');
            console.log('Unsupported file type');
        }
      }
    } catch (error) {
      console.error('Error opening document:', error);
      await this.showWarningToast('SCAN.UNSUPPORTED_FILE_TYPE');
    }
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
    //window.open(fileUrl, '_blank');
  }

  getFileExtension(fileUrl: string | undefined | null): string | null {
    return fileUrl ? fileUrl.split('.').pop()?.toLowerCase() || null : null;
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
    const file = input.files?.[0];
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
      const fileUrl = URL.createObjectURL(file);
      switch (fileExtension) {
        case 'pdf':
          await this.openFile(fileUrl, 'application/pdf');
          break;
        case 'txt':
          await this.openFile(fileUrl, 'text/plain');
          break;
        case 'docx':
          await this.openFile(fileUrl, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          break;
        case 'odt':
          await this.openFile(fileUrl, 'application/vnd.oasis.opendocument.text');
          break;
        default:
          await this.showWarningToast('SCAN.UNSUPPORTED_FILE_TYPE');
          console.log('Unsupported file type');
      }
    }
  }

  // Perform OCR on the selected image
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

  // Save recognized text to a file
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

  // Update recognized text (e.g., from textarea edits)
  updateText(event: Event) {
    const input = event.target as HTMLTextAreaElement;
    this.recognizedText = input.value;
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