import { Component } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-user',
  templateUrl: './user.page.html',
  styleUrls: ['./user.page.scss'],
  standalone: false
})
export class UserPage {
  loginForm: FormGroup;
  showWarningBanner: boolean = true;

  constructor(
    private formBuilder: FormBuilder,
    private alertController: AlertController
  ) {
    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]]
    });
  }

  onLogin() {
      // Perform login logic here
      this.showWarningBanner = false;
      setTimeout(() => {
        this.showWarningBanner = true;
      }, 300);
  }
}