# Privacy Policy

## What data is collected

**On your device (professor's laptop):**
- Student names and university-assigned student IDs
- Face embeddings — mathematical vectors that represent facial geometry (128 numbers per capture)
- Attendance session records (dates, present/absent, confidence scores)
- Session notes

**Temporarily in Supabase (if online enrollment is configured):**
- Student enrollment photo — deleted immediately when the professor approves enrollment
- Name, student ID, email (optional), and consent timestamp

## What face embeddings are — and are not

A face embedding is a list of 128 decimal numbers produced by a neural network analyzing the geometry of a face (distances between landmarks, proportions of facial regions). Embeddings cannot be reversed into a photo. There is no algorithm that can reconstruct a recognizable face from a Changttendance embedding. They are stored as binary data in the browser's IndexedDB.

## Photo handling

Student photos submitted through the online enrollment QR code flow are:
1. Uploaded to a private Supabase Storage bucket
2. Processed on the professor's device within seconds of approval
3. Immediately deleted from Supabase after processing — before any face embedding is stored

Photos are never stored to disk on the professor's device. Intermediate processing canvases are not persisted.

## Where data lives

| Data | Location |
|------|----------|
| Face embeddings | Browser IndexedDB on professor's device only |
| Attendance records | Browser IndexedDB on professor's device only |
| Enrollment photos | Supabase Storage — deleted within seconds of approval |
| Student name/ID | Browser IndexedDB on professor's device only |

No data is transmitted to any third-party analytics service. No data leaves the professor's device except the temporary enrollment photo upload.

## Data deletion

Students may request deletion of their data at any time by contacting Professor Chang. The professor can delete individual student records from the roster view, or use Settings → Delete All Data to wipe everything.

Students retain a copy of their consent acknowledgment text submitted with enrollment.

## FERPA compliance

Attendance records are education records under FERPA. This application stores all records locally on the professor's university-issued device. Records are not shared with third parties. The Supabase free tier is used only as a transient message queue; no FERPA-protected records persist there.

## State biometric data laws

If operating in Illinois, Texas, or Washington, consult your institution's legal counsel regarding BIPA (Illinois), CUBI (Texas), or the Washington My Health DATA Act before deployment. In-person enrollment with student consent is collected. Consider additional notice requirements under applicable state law.
