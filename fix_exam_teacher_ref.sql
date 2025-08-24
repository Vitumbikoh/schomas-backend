-- First, let's see what we have
SELECT 
  e.id,
  e.title,
  e."teacherId" as exam_teacher_id,
  t.id as teacher_id,
  t."userId" as teacher_user_id,
  t."firstName",
  t."lastName"
FROM exam e
LEFT JOIN teacher t ON e."teacherId" = t.id OR e."teacherId" = t."userId";

-- Update exam teacherId to point to the correct teacher.id instead of teacher.userId
UPDATE exam 
SET "teacherId" = (
  SELECT t.id 
  FROM teacher t 
  WHERE t."userId" = exam."teacherId"
)
WHERE EXISTS (
  SELECT 1 
  FROM teacher t 
  WHERE t."userId" = exam."teacherId"
);

-- Verify the fix
SELECT 
  e.id,
  e.title,
  e."teacherId" as exam_teacher_id,
  t.id as teacher_id,
  t."userId" as teacher_user_id,
  t."firstName",
  t."lastName"
FROM exam e
LEFT JOIN teacher t ON e."teacherId" = t.id;
