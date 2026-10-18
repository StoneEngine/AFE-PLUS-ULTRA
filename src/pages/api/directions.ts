import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";
import { withInternalKey } from "@/lib/withInternalKey";

// ไม่มีหน้าเว็บไหนเรียก (location.tsx ใช้ Google Maps ฝั่งเบราว์เซอร์ · navigation.tsx ใช้ Mapbox)
// ปิดไว้ให้เซิร์ฟเวอร์เราเรียกได้อย่างเดียว — เดิมคนนอกใช้คีย์ Google Maps ของเซิร์ฟเวอร์ได้ฟรี
export default withInternalKey(handler);

// ASVS 2.2.1: origin destination ต้องเป็นข้อความตัวเดียว ไม่ว่าง ไม่เกิน 200 ตัวอักษร (เดิมตรวจแค่ไม่ว่าง ส่งซ้ำได้ array)
const PLACE_TEXT_MAX = 200;
const isPlaceText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= PLACE_TEXT_MAX;

async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { origin, destination } = req.query;

    if (!isPlaceText(origin) || !isPlaceText(destination)) {
        return res.status(400).json({ error: "origin and destination must be non-empty text up to 200 characters" });
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

        // ASVS 15.3.1: ไม่มีผู้เรียก จึงคืนแค่ status + ระยะทาง/เวลาของแต่ละช่วง (legs[].distance duration) + เส้นทางย่อ (overview_polyline)
        // ช่องตามเอกสาร Google Directions API (DirectionsResponse/DirectionsRoute/DirectionsLeg) (เดิมคืนคำตอบของ Google ทั้งก้อน)
        const data = response.data ?? {};
        res.status(200).json({
            status: data.status,
            routes: (Array.isArray(data.routes) ? data.routes : []).map((route: any) => ({
                overview_polyline: route?.overview_polyline,
                legs: (Array.isArray(route?.legs) ? route.legs : []).map((leg: any) => ({
                    distance: leg?.distance,
                    duration: leg?.duration,
                })),
            })),
        });
    } catch (error) {
        console.error("Directions API error:", error);
        res.status(500).json({ error: "Failed to fetch directions" });
    }
}