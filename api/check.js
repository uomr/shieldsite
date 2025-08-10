export default function handler(req, res) {
  res.status(200).json({ apiKey: process.env.API_KEY || null });
}
