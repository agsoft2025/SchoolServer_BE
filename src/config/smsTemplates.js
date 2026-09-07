// Approved DLT (Fast2SMS) SMS templates offered in the SMS Center.
//
// The Fast2SMS `dlt` route only accepts messages whose content matches a
// template registered on the DLT portal. Each entry maps one approved template
// to the fields the SMS Center collects, and to an ordered variable list that
// becomes `variables_values` (pipe-joined) in the Fast2SMS request.
//
//   id        - Fast2SMS / DLT numeric template id (sent as `message` to bulkV2)
//   label     - shown in the template picker
//   body      - readable preview of the approved text. Put {{key}} where each of
//               the template's ordered {#var#} slots go. KEEP THIS IN SYNC with
//               the exact approved wording so staff see what recipients receive.
//   variables - one entry per {#var#} slot, IN ORDER:
//                 key    - matches a {{key}} token in `body`
//                 label  - shown in the UI
//                 source - 'input'  => staff type the value in the SMS Center
//                        - '<name>' => auto-filled per recipient from the student
//                          record. Allowed names: student_name, father_name,
//                          mother_name, registration_number, class_name,
//                          section, hostel_name, board_name
//
// NOTE: 224809 is currently the only DLT template approved on this account (it is
// also used for login OTP). Update `body` to its exact approved wording, and
// change the second variable if that slot is not a free-text message.
module.exports = [
  {
    id: '224809',
    label: 'Student Notification',
    body: 'Dear {{student_name}}, {{message}} - SID GROUPS',
    variables: [
      { key: 'student_name', label: 'Student name (auto-filled)', source: 'student_name' },
      { key: 'message', label: 'Message text', source: 'input' },
    ],
  },
];
