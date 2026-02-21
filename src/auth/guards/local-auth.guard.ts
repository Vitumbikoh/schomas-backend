// src/auth/guards/local-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExecutionContext } from '@nestjs/common';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
	getRequest(context: ExecutionContext) {
		const req = context.switchToHttp().getRequest();

		if (req?.body) {
			const { username, identifier, email } = req.body;

			// Normalize login identifiers for passport-local pre-validation checks.
			// passport-local requires configured `usernameField` + `password` before validate() runs.
			if (!identifier && username) {
				req.body.identifier = username;
			} else if (!identifier && email) {
				req.body.identifier = email;
			}

			// Keep backward compatibility for flows that still read `username`.
			if (!username && identifier) {
				req.body.username = identifier;
			}
		}

		return req;
	}
}
