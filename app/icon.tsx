import { renderAppIcon } from "@/lib/appIcon";

const SIZES = [32, 192, 512];

export function generateImageMetadata() {
  return SIZES.map((s) => ({
    id: String(s),
    contentType: "image/png",
    size: { width: s, height: s },
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  return renderAppIcon(Number(await id));
}
