import { HttpException, HttpStatus } from '@nestjs/common';

// Error de validación de negocio (400). Se usa cuando la petición llega bien
// formada pero un dato (p. ej. un token) no es válido o ha caducado.
export class BadRequestException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message,
        error: 'Bad Request',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class ConflictException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        message,
        error: 'Conflict',
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class ForbiddenException extends HttpException {
  constructor(message = 'Forbidden') {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        message,
        error: 'Forbidden',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

export class NotFoundException extends HttpException {
  constructor(message = 'Not Found') {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        message,
        error: 'Not Found',
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class BadGatewayException extends HttpException {
  constructor(message = 'Bad Gateway') {
    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        message,
        error: 'Bad Gateway',
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}

export class ServiceUnavailableException extends HttpException {
  constructor(message = 'Service Unavailable') {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message,
        error: 'Service Unavailable',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
