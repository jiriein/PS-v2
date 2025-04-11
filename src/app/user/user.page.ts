import { Component } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-user',
  templateUrl: './user.page.html',
  styleUrls: ['./user.page.scss'],
  standalone: false
})
export class UserPage{
  loginForm: FormGroup;

  constructor(
    private formBuilder: FormBuilder,
    private alertController: AlertController
  ) {
    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]]
    });
  }

  async onLogin() {
    if (this.loginForm.valid) {
      const { email, password } = this.loginForm.value;
      // Handle login logic here (API call)
      console.log('Login successful with:', email, password);

      // Show success message
      const alert = await this.alertController.create({
        header: 'Login Successful',
        message: `Welcome, ${email}!`,
        buttons: ['OK']
      });
      await alert.present();
    }
  }
}