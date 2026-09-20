import { Injectable } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import {
  ForgotPasswordDto,
  AppleSignInDto,
  GoogleSignInDto,
  LoginDto,
  RefreshTokenBodyDto,
  ResetPasswordDto,
  SignOutBodyDto,
} from '../dtos/auth.dto';
import { RegisterUserDto } from '../../user/dtos/user.dto';

@Injectable()
export class AuthUC {
  constructor(private readonly _authService: AuthService) {}

  async login(body: LoginDto) {
    return await this._authService.signIn(body);
  }

  async registerQuick(body: RegisterUserDto) {
    return await this._authService.quickRegister(body);
  }

  async googleSignIn(body: GoogleSignInDto) {
    return await this._authService.googleSignIn(body);
  }

  async appleSignIn(body: AppleSignInDto) {
    return await this._authService.appleSignIn(body);
  }

  async linkApple(userId: string, body: AppleSignInDto) {
    return await this._authService.linkApple(userId, body);
  }

  async unlinkApple(userId: string) {
    return await this._authService.unlinkApple(userId);
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
