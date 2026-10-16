import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";
import { withInternalKey } from "@/lib/withInternalKey";

// ไม่มีหน้าเว็บไหนเรียก (location.tsx ใช้ Google Maps ฝั่งเบราว์เซอร์ · navigation.tsx ใช้ Mapbox)
// ปิดไว้ให้เซิร์ฟเวอร์เราเรียกได้อย่างเดียว — เดิมคนนอกใช้คีย์ Google Maps ของเซิร์ฟเวอร์ได้ฟรี
export default withInternalKey(handler);

async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { origin, destination } = req.query;

    if (!origin || !destination) {
        return res.status(400).json({ error: "origin and destination required" });
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GoogleMapsApiKey || "";

    try {
        const response = await axios.get("https://maps.googleapis.com/maps/api/directions/json", {
            params: {
                origin,
                destination,
                mode: "driving",
                language: "th",
                region: "TH",
                key: apiKey,
            },
        });

        res.status(200).json(response.data);
    } catch (error) {
        console.error("Directions API error:", error);
        res.status(500).json({ error: "Failed to fetch directions" });
    }
}