import { Injectable } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import {
  ForgotPasswordDto,
  GoogleSignInDto,
  LoginDto,
  RefreshTokenBodyDto,
  ResetPasswordDto,
  SignOutBodyDto,
} from '../dtos/auth.dto';

@Injectable()
export class AuthUC {
  constructor(private readonly _authService: AuthService) {}

  async login(body: LoginDto) {
    return await this._authService.signIn(body);
  }

  async googleSignIn(body: GoogleSignInDto) {
    return await this._authService.googleSignIn(body);
  }

  async linkGoogle(userId: string, body: GoogleSignInDto) {
    return await this._authService.linkGoogle(userId, body.idToken);
  }

  async unlinkGoogle(userId: string) {
    return await this._authService.unlinkGoogle(userId);
  }

  async refreshToken(body: RefreshTokenBodyDto) {
    return this._authService.refreshToken(body);
  }

  async signOut(body: SignOutBodyDto) {
    return await this._authService.signOut(body);
  }

  async forgotPassword(body: ForgotPasswordDto) {
    return await this._authService.forgotPassword(body.email);
  }

  async resetPassword(body: ResetPasswordDto) {
    return await this._authService.resetPassword(
      body.email,
      body.code,
      body.newPassword,
    );
  }
}
