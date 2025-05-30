import { Component } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { TranslateService } from '@ngx-translate/core';
import { FormBuilder, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: false
})

export class SettingsPage {
  settingsForm: FormGroup;

  constructor(private formBuilder: FormBuilder, private translate: TranslateService, private storage: Storage) {
    this.settingsForm = this.formBuilder.group({
      theme: [false], // Boolean: true = dark, false = classic
      language: ['cz'],
      fontSize: ['medium'],
      customFontSize: [''],
    });

    this.loadSettings();
  }

  ngOnInit() {
    this.settingsForm.get('customFontSize')?.valueChanges.subscribe((value) => {
      document.body.style.fontSize = `${value || 16}px`;
      this.storage.set('customFontSize', value);
    });
    this.settingsForm.get('theme')?.valueChanges.subscribe((isDark) => {
      document.body.classList.toggle('dark-theme', isDark);
    });
  }

  async loadSettings() {
    const theme = await this.storage.get('theme') || 'classic';
    const language = await this.storage.get('language') || 'cz';
    const fontSize = await this.storage.get('fontSize') || 'medium';
    const customFontSize = await this.storage.get('customFontSize') || '';

    this.settingsForm.patchValue({ theme: theme === 'dark', language, fontSize, customFontSize });
  }

  // Handle Theme Change
  onThemeChange(event: any) {
    const isDark = event.detail.checked;
    const theme = isDark ? 'dark' : 'classic';
    this.storage.set('theme', theme);
    this.settingsForm.patchValue({ theme: isDark });
  }

  // Handle Language Change
  onLanguageChange(event: any) {
    const language = event.detail.value;
    this.translate.use(language);
    this.storage.set('language', language);
  }

  // Handle Font Size Change
  onFontSizeChange(event: any) {
    const fontSize = event.detail.value;
    document.body.style.fontSize = this.getFontSizeValue(fontSize);
    this.storage.set('fontSize', fontSize);
  }

  // Helper method to set custom font size
  getFontSizeValue(fontSize: string): string {
    const customSize = this.settingsForm.get('customFontSize')?.value || 16;
    switch (fontSize) {
      case 'small':
        return '12px';
      case 'medium':
        return '16px';
      case 'big':
        return '22px';
      default:
        return `${customSize}px`;
    }
  }

}