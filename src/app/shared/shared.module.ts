import { NgModule } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TabsComponent } from '../components/tabs/tabs.component';
import { HeaderComponent } from '../components/header/header.component';
import { RegulationPatternService } from '../services/regulation-pattern.service';
import { ZakonyApiService } from '../services/zakony-api.service';

@NgModule({
  declarations: [HeaderComponent, TabsComponent],
  imports: [CommonModule, IonicModule, TranslateModule.forChild(), FormsModule, ReactiveFormsModule],
  exports: [HeaderComponent, TabsComponent, CommonModule, IonicModule, TranslateModule, FormsModule, ReactiveFormsModule],
  providers: [RegulationPatternService, ZakonyApiService]
})
export class SharedModule {}