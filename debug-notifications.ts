// Debug script to test notification creation
// This should be run from within the NestJS application context

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { NotificationService } from './src/notifications/notification.service';
import { SchoolsService } from './src/school/schools.service';
import { NotificationType, NotificationPriority } from './src/notifications/entities/notification.entity';

async function testNotifications() {
  console.log('🧪 Testing notification creation...');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    const notificationService = app.get(NotificationService);
    const schoolsService = app.get(SchoolsService);
    
    // Get the first school
    const schools = await schoolsService.findAll();
    if (schools.length === 0) {
      console.log('❌ No schools found. Please create a school first.');
      return;
    }
    
    const testSchool = schools[0];
    console.log(`📋 Using school: ${testSchool.name} (ID: ${testSchool.id})`);
    
    // Create a test notification
    const notification = await notificationService.create({
      title: 'Debug Test Notification',
      message: `This is a test notification for school ${testSchool.name}`,
      type: NotificationType.SYSTEM,
      priority: NotificationPriority.MEDIUM,
      schoolId: testSchool.id,
      metadata: {
        test: true,
        timestamp: new Date().toISOString(),
        source: 'debug-script'
      }
    });
    
    console.log('✅ Notification created:', notification);
    
    // Check all notifications (as SUPER_ADMIN)
    const { notifications, total } = await notificationService.findAll(1, 10, undefined, 'SUPER_ADMIN');
    console.log(`📊 Total notifications in database: ${total}`);
    console.log('📝 Recent notifications:', notifications.map(n => ({
      id: n.id,
      title: n.title,
      type: n.type,
      schoolId: n.schoolId,
      read: n.read,
      createdAt: n.createdAt
    })));
    
    // Check unread count (as SUPER_ADMIN)
    const unreadCount = await notificationService.getUnreadCount(undefined, 'SUPER_ADMIN');
    console.log(`🔔 Unread notifications: ${unreadCount}`);
    
    // Check school-specific notifications (as ADMIN for that school)
    const schoolNotifications = await notificationService.findAll(1, 10, testSchool.id, 'ADMIN');
    console.log(`🏫 School-specific notifications: ${schoolNotifications.total}`);
    
  } catch (error) {
    console.error('❌ Error testing notifications:', error);
  } finally {
    await app.close();
  }
}

testNotifications().catch(console.error);