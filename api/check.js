export default function handler(req, res) {
  // لا تحقق Authorization هنا
  res.status(200).json({ apiKey: process.env.API_KEY || null });
}
