const studentModel = require('../../model/studentModel');

const normalizePhone = (raw) => {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
};

// Resolves the target student list for a send request, scoped to the requesting
// user's location (SUPER ADMIN may target any location explicitly), and de-duplicates
// by phone number so siblings sharing a guardian number aren't texted twice.
const resolveRecipients = async ({ mode, user, studentId, classIds, search, locationId }) => {
  const locationFilter =
    user.role === 'SUPER ADMIN'
      ? locationId
        ? { location_id: locationId }
        : {}
      : { location_id: user.location_id };

  const filter = { isDeleted: { $ne: true }, ...locationFilter };

  if (mode === 'individual') {
    if (!studentId) return [];
    filter._id = studentId;
  } else if (mode === 'classwise') {
    if (!Array.isArray(classIds) || !classIds.length) return [];
    filter.class_info = { $in: classIds };
  } else if (mode === 'bulk' && search) {
    filter.$or = [
      { student_name: { $regex: search, $options: 'i' } },
      { registration_number: { $regex: search, $options: 'i' } },
    ];
  }

  const students = await studentModel
    .find(filter)
    .populate('class_info', 'class_name section academic_year')
    .select('student_name father_name mother_name registration_number contact_number class_info hostel_name board_name location_id')
    .lean();

  const seenPhones = new Set();
  const recipients = [];

  for (const student of students) {
    const phone = normalizePhone(student.contact_number);
    if (!phone || seenPhones.has(phone)) continue;
    seenPhones.add(phone);

    recipients.push({
      studentId: student._id,
      phone,
      locationId: student.location_id,
      variables: {
        student_name: student.student_name || '',
        father_name: student.father_name || '',
        mother_name: student.mother_name || '',
        registration_number: student.registration_number || '',
        class_name: student.class_info?.class_name || '',
        section: student.class_info?.section || '',
        hostel_name: student.hostel_name || '',
        board_name: student.board_name || '',
      },
    });
  }

  return recipients;
};

module.exports = { resolveRecipients, normalizePhone };
