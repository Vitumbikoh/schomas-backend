-- Add Graduated classes to all existing schools
-- This script creates a "Graduated" class for each school that doesn't already have one

INSERT INTO classes (id, name, "numericalName", description, "isActive", "createdAt", "updatedAt", "schoolId")
SELECT
    gen_random_uuid() as id,
    'Graduated' as name,
    999 as "numericalName",
    'Default graduation class for completed students' as description,
    true as "isActive",
    NOW() as "createdAt",
    NOW() as "updatedAt",
    s.id as "schoolId"
FROM schools s
WHERE NOT EXISTS (
    SELECT 1 FROM classes c
    WHERE c."schoolId" = s.id AND c.name = 'Graduated'
);

-- Show results
SELECT
    s.name as school_name,
    s.code as school_code,
    COUNT(c.id) as total_classes,
    COUNT(CASE WHEN c.name = 'Graduated' THEN 1 END) as graduated_classes
FROM schools s
LEFT JOIN classes c ON c."schoolId" = s.id
GROUP BY s.id, s.name, s.code
ORDER BY s.name;