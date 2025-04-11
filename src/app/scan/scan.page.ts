
import { Component } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ActionSheetController } from '@ionic/angular';
import { File } from '@awesome-cordova-plugins/file/ngx';
import { FileOpener } from '@awesome-cordova-plugins/file-opener/ngx';
import { FileChooser } from '@awesome-cordova-plugins/file-chooser/ngx';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { FileTransfer, FileTransferObject } from '@awesome-cordova-plugins/file-transfer/ngx';

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
      this.triggerWebFileInput();
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
  }

  getFileExtension(fileUrl: string | undefined | null): string | null {
    return fileUrl ? fileUrl.split('.').pop()?.toLowerCase() || null : null;
  }

  // Web-only file input trigger
  triggerWebFileInput() {
    const fileInput = document.getElementById('webFileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  // Handle file selection on web
  handleWebFileSelection(event: any) {
    const file = event.target.files[0];
    if (file) {
      console.log('Selected file:', file);
      //TODO: Process the file as needed (e.g., display, upload, etc.)
    }
  }

}
