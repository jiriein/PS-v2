import { Component } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ActionSheetController, Platform, ToastController } from '@ionic/angular';
import { File } from '@awesome-cordova-plugins/file/ngx';
import { FileOpener } from '@awesome-cordova-plugins/file-opener/ngx';
import { FileChooser } from '@awesome-cordova-plugins/file-chooser/ngx';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { FileTransfer, FileTransferObject } from '@awesome-cordova-plugins/file-transfer/ngx';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-scan',
  templateUrl: './scan.page.html',
  styleUrls: ['./scan.page.scss'],
  standalone: false
})
export class ScanPage {
  fileTransfer: FileTransferObject;
  isNative: boolean = Capacitor.getPlatform() !== 'web';

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

  // Native-only scan with camera
  async scanWithCamera() {
    if (!this.isNative) return;
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera
      });
      console.log('Image captured from Camera:', image.webPath);
      //TODO: Process the image
    } catch (error) {
      console.error('Error capturing image from camera:', error);
    }
  }

  // Native-only scan from gallery
  async scanFromGallery() {
    if (!this.isNative) return;
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos
      });
      console.log('Image selected from Gallery:', image.webPath);
      //TODO: Process the image
    } catch (error) {
      console.error('Error selecting image from gallery:', error);
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

      if (!fileExtension) return;

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
          // TODO: Add support for other file types
          await this.showWarningToast('UNSUPPORTED_FILE_TYPE');
          console.log('Unsupported file type');
      }
    } catch (error) {
      console.error('Error opening document:', error);
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
  async handleWebFileSelection(event: any) {
    const file = event.target.files[0];
    if (file) {
      console.log('Selected file:', file);
      const fileUrl = URL.createObjectURL(file);
      const fileExtension = this.getFileExtension(file.name);
  
      if (!fileExtension) return;
  
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
          // TODO: Add support for other file types
          await this.showWarningToast('UNSUPPORTED_FILE_TYPE');
          console.log('Unsupported file type');
      }
    }
  }

  async showWarningToast(messageKey: string) {
    const toast = await this.toastController.create({
      message: this.translate.instant(messageKey),
      duration: 3000, // Show for 3 seconds
      position: 'middle',
      cssClass: 'warning-toast', // Custom CSS
      color: 'danger'
    });
    await toast.present();
  }

}