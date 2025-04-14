import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Storage } from '@ionic/storage-angular';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  constructor(private translate: TranslateService, private storage: Storage) {
    this.initializeApp();
  }

  async initializeApp() {
    await this.storage.create();

    const language = (await this.storage.get('language')) || 'cz';
    this.translate.setDefaultLang('cz');
    this.translate.use(language);
  }
}
