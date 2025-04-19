// // src/auth/auth.controller.ts
// import { Controller, Post, Body, HttpException } from '@nestjs/common';
// import { AuthService } from './auth.service';
// import { RegisterDto } from './dto/register.dto';
// import { LoginDto } from './dto/login.dto';

// @Controller('auth')
// export class AuthController {
//   constructor(private authService: AuthService) {}

//   @Post('register')
//   async register(@Body() registerDto: RegisterDto) {
//     try {
//       return await this.authService.register(registerDto);
//     } catch (error) {
//       throw new HttpException(
//         error.response || 'Registration failed',
//         error.status || 500,
//       );
//     }
//   }

//   @Post('login')
//   async login(@Body() loginDto: LoginDto) {
//     try {
//       return await this.authService.login(loginDto);
//     } catch (error) {
//       throw new HttpException(
//         error.response || 'Login failed',
//         error.status || 401,
//       );
//     }
//   }
// }