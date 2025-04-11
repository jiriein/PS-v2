import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { SettingsPage } from './settings.page';
import { SettingsPageRoutingModule } from './settings-routing.module';

@NgModule({
  imports: [
    SettingsPageRoutingModule,
    SharedModule
  ],
  declarations: [SettingsPage]
})
export class SettingsPageModule {}
