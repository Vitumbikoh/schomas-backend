# School Admin Credentials Management

## Overview
This feature allows super admins to store and retrieve school administrator credentials when creating schools. This ensures that super admins have access to the login credentials that are automatically generated for each school's admin user.

## Database Schema

### Table: `school_admin_credentials`
- `id` (UUID, Primary Key)
- `schoolId` (UUID, Foreign Key to schools table)
- `username` (String) - The admin username for the school
- `email` (String) - The admin email for the school
- `password` (String) - The plain text password (for super admin reference only)
- `isActive` (Boolean) - Whether the credentials are active
- `passwordChanged` (Boolean) - Tracks if admin has changed the default password
- `createdAt` (Timestamp)
- `updatedAt` (Timestamp)

## API Endpoints

### 1. Get All School Credentials
**GET** `/schools/credentials/all`

**Authorization**: Super Admin only

**Query Parameters**:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `search` (optional): Search by school name, code, username, or email

**Response**:
```json
{
  "credentials": [
    {
      "id": "uuid",
      "schoolId": "uuid",
      "schoolName": "Example School",
      "schoolCode": "EXS",
      "username": "exampleadmin",
      "email": "admin@exs.com",
      "password": "12345678",
      "isActive": true,
      "passwordChanged": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 10
}
```

### 2. Get Credentials for Specific School
**GET** `/schools/:id/credentials`

**Authorization**: Super Admin only

**Parameters**:
- `id` (path): School ID

**Response**:
```json
{
  "id": "uuid",
  "schoolId": "uuid",
  "schoolName": "Example School",
  "schoolCode": "EXS",
  "username": "exampleadmin",
  "email": "admin@exs.com",
  "password": "12345678",
  "isActive": true,
  "passwordChanged": false,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### 3. Reset Admin Password
**PATCH** `/schools/:id/credentials/reset-password`

**Authorization**: Super Admin only

**Parameters**:
- `id` (path): School ID

**Description**: Resets the school admin password to the default and forces password reset on next login.

**Response**:
```json
{
  "newPassword": "12345678"
}
```

## Features

### 1. Automatic Credential Storage
When a school is created, the system automatically:
- Generates admin credentials (username, email, password)
- Creates the admin user account
- Stores the credentials in the `school_admin_credentials` table for super admin reference

### 2. Password Change Tracking
- When a school admin changes their password, the `passwordChanged` flag is set to `true`
- This helps super admins know whether the admin is still using the default password

### 3. Password Reset Capability
- Super admins can reset a school admin's password back to the default
- The system updates both the user's password and the stored credentials
- Forces the admin to change password on next login

### 4. Security Considerations
- Credentials are only accessible to super admins
- Plain text passwords are stored only for super admin reference (since they need to provide them to school admins)
- The actual user passwords are always hashed in the users table

## Usage Flow

1. **School Creation**: Super admin creates a school
   - System generates admin credentials
   - Admin user account is created with hashed password
   - Credentials are stored in plain text for super admin reference

2. **Credential Retrieval**: Super admin can view all school credentials or specific school credentials

3. **Admin Login**: School admin logs in with provided credentials
   - Forced to change password on first login
   - `passwordChanged` flag is updated when password is changed

4. **Password Reset**: If needed, super admin can reset admin password
   - Password is reset to default
   - Admin must change password on next login

## Frontend Integration

The frontend can use these endpoints to:
- Display a list of all schools with their admin credentials
- Show credential details for a specific school
- Provide a reset password function for school admins
- Indicate which admins have changed their default passwords

## Migration

The `AddSchoolAdminCredentials1735200000000` migration creates the necessary table structure with proper foreign key constraints and unique constraints to ensure data integrity.
