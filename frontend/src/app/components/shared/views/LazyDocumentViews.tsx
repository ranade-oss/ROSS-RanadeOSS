"use client";

import dynamic from "next/dynamic";

export const LazyDocxView = dynamic(
    () => import("./DocxView").then(({ DocxView }) => DocxView),
    { ssr: false },
);

export const LazyPdfView = dynamic(
    () => import("./PdfView").then(({ PdfView }) => PdfView),
    { ssr: false },
);

export const LazySpreadsheetView = dynamic(
    () =>
        import("./SpreadsheetView").then(
            ({ SpreadsheetView }) => SpreadsheetView,
        ),
    { ssr: false },
);
