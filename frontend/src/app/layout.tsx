import type { Metadata } from "next";
import { Inter, EB_Garamond } from "next/font/google";
import "./globals.css";
import { Providers } from "@/app/components/providers";
import { rossBrand } from "@/app/lib/rossBrand";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});

const ebGaramond = EB_Garamond({
    variable: "--font-eb-garamond",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
    metadataBase: new URL(rossBrand.appUrl),
    title: `${rossBrand.name} — Ontario-first legal workspace`,
    description: `${rossBrand.description} ${rossBrand.betaLabel}.`,
    icons: {
        icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
        apple: "/apple-touch-icon.png",
    },
    openGraph: {
        type: "website",
        url: rossBrand.appUrl,
        siteName: rossBrand.name,
        title: `${rossBrand.name} — Ontario-first legal workspace`,
        description: `${rossBrand.description} ${rossBrand.betaLabel}.`,
        images: [
            {
                url: "/ross-social-card.png",
                width: 1200,
                height: 630,
                alt: `${rossBrand.name}: ${rossBrand.tagline}`,
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: `${rossBrand.name} — Ontario-first legal workspace`,
        description: `${rossBrand.description} ${rossBrand.betaLabel}.`,
        images: ["/ross-social-card.png"],
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body
                className={`${inter.variable} ${ebGaramond.variable} font-sans antialiased`}
            >
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
