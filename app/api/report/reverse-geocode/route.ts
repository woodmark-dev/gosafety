import { NextResponse } from "next/server";

type ReverseGeocodePayload = {
  formattedAddress: string;
  locationName: string;
  locality: string;
  region: string;
  country: string;
  provider: "google" | "nominatim";
};

type NominatimResponse = {
  display_name?: string;
  name?: string;
  address?: {
    road?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    state_district?: string;
    state?: string;
    county?: string;
    country?: string;
  };
};

type GoogleGeocodeResponse = {
  status?: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    types?: string[];
    geometry?: {
      location_type?: "ROOFTOP" | "RANGE_INTERPOLATED" | "GEOMETRIC_CENTER" | "APPROXIMATE";
    };
    address_components?: Array<{
      long_name?: string;
      short_name?: string;
      types?: string[];
    }>;
  }>;
};

function parseFloatOrNull(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function toPointLabel(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function hasStreetLevelData(data: NominatimResponse): boolean {
  return Boolean(
    firstNonEmpty(
      data.name,
      data.address?.road,
      data.address?.neighbourhood,
      data.address?.suburb,
      data.address?.city,
      data.address?.town,
      data.address?.village
    )
  );
}

function findAddressComponent(
  components: Array<{ long_name?: string; types?: string[] }> | undefined,
  ...targetTypes: string[]
): string | undefined {
  if (!components || components.length === 0) return undefined;
  for (const type of targetTypes) {
    const component = components.find((item) => item.types?.includes(type));
    if (component?.long_name?.trim()) {
      return component.long_name.trim();
    }
  }
  return undefined;
}

function googleLocationTypeRank(locationType?: string): number {
  if (locationType === "ROOFTOP") return 4;
  if (locationType === "RANGE_INTERPOLATED") return 3;
  if (locationType === "GEOMETRIC_CENTER") return 2;
  if (locationType === "APPROXIMATE") return 1;
  return 0;
}

function pickBestGoogleResult(
  results: Array<{
    formatted_address?: string;
    geometry?: { location_type?: string };
    types?: string[];
    address_components?: Array<{ long_name?: string; types?: string[] }>;
  }>
) {
  return [...results].sort((a, b) => {
    const rankDiff =
      googleLocationTypeRank(b.geometry?.location_type) -
      googleLocationTypeRank(a.geometry?.location_type);
    if (rankDiff !== 0) return rankDiff;
    const typeCountA = a.types?.length ?? 0;
    const typeCountB = b.types?.length ?? 0;
    return typeCountB - typeCountA;
  })[0];
}

async function reverseWithGoogle(lat: number, lng: number, apiKey: string) {
  const googleUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  googleUrl.searchParams.set("latlng", `${lat},${lng}`);
  googleUrl.searchParams.set("key", apiKey);

  const response = await fetch(googleUrl.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Google geocoding provider unavailable");
  }

  const data = (await response.json()) as GoogleGeocodeResponse;
  if (data.status !== "OK" || !data.results?.length) {
    throw new Error(data.error_message || data.status || "Google geocoding failed");
  }

  const best = pickBestGoogleResult(data.results);
  const components = best.address_components;

  const locality = firstNonEmpty(
    findAddressComponent(components, "locality"),
    findAddressComponent(components, "sublocality", "sublocality_level_1"),
    findAddressComponent(components, "administrative_area_level_2")
  );

  const locationName = firstNonEmpty(
    findAddressComponent(components, "premise", "subpremise"),
    findAddressComponent(components, "route"),
    findAddressComponent(components, "point_of_interest", "establishment"),
    locality,
    toPointLabel(lat, lng)
  );

  const result: ReverseGeocodePayload = {
    formattedAddress:
      firstNonEmpty(best.formatted_address) ?? `Approx point: ${toPointLabel(lat, lng)}`,
    locationName: locationName ?? `Approx point: ${toPointLabel(lat, lng)}`,
    locality: locality ?? "",
    region:
      firstNonEmpty(
        findAddressComponent(components, "administrative_area_level_1"),
        findAddressComponent(components, "administrative_area_level_2")
      ) ?? "",
    country: firstNonEmpty(findAddressComponent(components, "country")) ?? "",
    provider: "google",
  };

  return result;
}

async function reverseWithNominatim(lat: number, lng: number) {
  const nominatimUrl = new URL("https://nominatim.openstreetmap.org/reverse");
  nominatimUrl.searchParams.set("format", "jsonv2");
  nominatimUrl.searchParams.set("lat", String(lat));
  nominatimUrl.searchParams.set("lon", String(lng));
  nominatimUrl.searchParams.set("addressdetails", "1");

  const response = await fetch(nominatimUrl.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "GoSafety/1.0 (+reverse-geocode)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Nominatim reverse geocoding unavailable");
  }

  const data = (await response.json()) as NominatimResponse;

  const locality = firstNonEmpty(
    data.address?.city,
    data.address?.town,
    data.address?.village,
    data.address?.suburb,
    data.address?.county
  );

  const baseLocationName = firstNonEmpty(
    data.name,
    data.address?.road,
    data.address?.neighbourhood,
    data.address?.suburb,
    data.address?.city,
    data.address?.town,
    data.address?.village,
    data.address?.county,
    data.address?.state_district
  );

  const baseFormattedAddress = firstNonEmpty(data.display_name) ?? "";
  const pointLabel = toPointLabel(lat, lng);
  const streetLevel = hasStreetLevelData(data);

  const locationName = streetLevel
    ? (baseLocationName ?? "")
    : `Near ${baseLocationName ?? locality ?? "reported point"} (${pointLabel})`;

  const formattedAddress = streetLevel
    ? baseFormattedAddress
    : baseFormattedAddress
      ? `${baseFormattedAddress} [Approx point: ${pointLabel}]`
      : `Approx point: ${pointLabel}`;

  const result: ReverseGeocodePayload = {
    formattedAddress,
    locationName,
    locality: locality ?? "",
    region:
      firstNonEmpty(data.address?.state, data.address?.state_district, data.address?.county) ?? "",
    country: firstNonEmpty(data.address?.country) ?? "",
    provider: "nominatim",
  };

  return result;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloatOrNull(searchParams.get("lat"));
    const lng = parseFloatOrNull(searchParams.get("lng"));
    const providerParam = searchParams.get("provider")?.toLowerCase();
    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (lat === null || lng === null) {
      return NextResponse.json({ message: "lat and lng are required" }, { status: 400 });
    }

    const shouldForceGoogle = providerParam === "google";
    const shouldPreferGoogle = shouldForceGoogle || !providerParam;

    if (shouldPreferGoogle && googleApiKey) {
      try {
        const result = await reverseWithGoogle(lat, lng, googleApiKey);
        return NextResponse.json(result);
      } catch (googleError) {
        if (shouldForceGoogle) {
          return NextResponse.json(
            {
              message: "Google reverse geocoding failed",
              error: googleError instanceof Error ? googleError.message : "Unknown error",
            },
            { status: 502 }
          );
        }
      }
    }

    const fallback = await reverseWithNominatim(lat, lng);
    return NextResponse.json(fallback);
  } catch (error) {
    return NextResponse.json(
      {
        message: "Reverse geocoding failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
