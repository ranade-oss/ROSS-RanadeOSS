"use client";

import { createPortal } from "react-dom";
import {
    useEffect,
    useId,
    useRef,
    type ButtonHTMLAttributes,
    type ReactNode,
} from "react";
import { X } from "lucide-react";
import { PillButton } from "@/app/components/ui/pill-button";
import { cn } from "@/app/lib/utils";

type ModalSize = "sm" | "md" | "lg" | "xl";
type ModalAction = Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "className"
> & {
    label: ReactNode;
    icon?: ReactNode;
    variant?: "primary" | "secondary" | "danger";
};

interface ModalProps {
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    breadcrumbs?: ReactNode[];
    headerAction?: ReactNode;
    size?: ModalSize;
    className?: string;
    footerStatus?: ReactNode;
    primaryAction?: ModalAction;
    secondaryAction?: ModalAction;
    cancelAction?: ModalAction | false;
    ariaLabel?: string;
}

const sizeClassName: Record<ModalSize, string> = {
    sm: "max-w-md",
    md: "max-w-xl",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
};

export function Modal({
    open,
    onClose,
    children,
    breadcrumbs,
    headerAction,
    size = "lg",
    className,
    footerStatus,
    primaryAction,
    secondaryAction,
    cancelAction,
    ariaLabel = "Dialog",
}: ModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const hasHeader = breadcrumbs?.length;
    const hasFooter =
        footerStatus || primaryAction || secondaryAction || cancelAction;
    const resolvedCancelAction = cancelAction;

    useEffect(() => {
        if (!open) return;

        const previouslyFocused = document.activeElement as HTMLElement | null;
        const dialog = dialogRef.current;
        if (!dialog) return;

        const overlay = dialog.parentElement;
        const backgroundStates = Array.from(document.body.children)
            .filter((element) => element !== overlay)
            .map((element) => ({
                element: element as HTMLElement,
                inert: (element as HTMLElement).inert,
                ariaHidden: element.getAttribute("aria-hidden"),
            }));
        for (const { element } of backgroundStates) {
            element.inert = true;
            element.setAttribute("aria-hidden", "true");
        }

        const focusable = () =>
            Array.from(
                dialog.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
                ),
            ).filter((element) => !element.hasAttribute("hidden"));
        (focusable()[0] ?? dialog).focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== "Tab") return;
            const candidates = focusable();
            if (candidates.length === 0) {
                event.preventDefault();
                dialog.focus();
                return;
            }
            const first = candidates[0];
            const last = candidates[candidates.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            for (const { element, inert, ariaHidden } of backgroundStates) {
                element.inert = inert;
                if (ariaHidden === null) element.removeAttribute("aria-hidden");
                else element.setAttribute("aria-hidden", ariaHidden);
            }
            previouslyFocused?.focus();
        };
    }, [onClose, open]);

    if (!open) return null;

    return createPortal(
        <div
            className={cn(
                "fixed inset-0 z-[200] flex items-center justify-center px-4",
                "bg-white/10 backdrop-blur-[2px]",
            )}
            onClick={onClose}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={hasHeader ? titleId : undefined}
                aria-label={hasHeader ? undefined : ariaLabel}
                tabIndex={-1}
                className={cn(
                    "w-full rounded-3xl flex h-[min(600px,calc(100dvh-2rem))] flex-col",
                    sizeClassName[size],
                    "border border-white/70 bg-gray-50/95 shadow-[0_14px_40px_rgba(15,23,42,0.101),0_5px_14px_rgba(15,23,42,0.067)] backdrop-blur-3xl",
                    className,
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {hasHeader && (
                    <div className="flex items-center justify-between gap-3 p-4 pl-5">
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs leading-none text-gray-400">
                                {breadcrumbs?.map((segment, index) => (
                                    <span
                                        key={index}
                                        className="flex items-center gap-1.5"
                                    >
                                        {index > 0 && <span>›</span>}
                                        <span
                                            id={
                                                index ===
                                                (breadcrumbs?.length ?? 0) - 1
                                                    ? titleId
                                                    : undefined
                                            }
                                            className={cn(
                                                "truncate",
                                                index ===
                                                    (breadcrumbs?.length ?? 0) -
                                                        1 && "text-gray-700",
                                            )}
                                        >
                                            {segment}
                                        </span>
                                    </span>
                                ))}
                            </div>
                            {headerAction}
                        </div>
                        <button
                            onClick={onClose}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/70 bg-white/55 text-gray-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),inset_0_-1px_0_rgba(255,255,255,0.55),0_6px_18px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-colors hover:bg-white/75 hover:text-gray-700"
                            aria-label="Close"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}
                {/* Body never scrolls itself (so children's edge shadows are
                    never clipped by the header/footer). Content that can exceed
                    the modal height wraps its scrollable region in an inner
                    `overflow-y-auto` div. */}
                <div className="flex min-h-0 flex-1 flex-col px-5">
                    {children}
                </div>
                {hasFooter && (
                    <div
                        className={cn(
                            "flex items-center gap-3 p-3",
                            secondaryAction ? "justify-between" : "justify-end",
                            "border-t border-white/60",
                        )}
                    >
                        {secondaryAction && (
                            <div className="flex min-w-0 items-center gap-2">
                                <ModalActionButton
                                    action={secondaryAction}
                                    fallbackVariant="secondary"
                                />
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            {footerStatus}
                            {resolvedCancelAction && (
                                <ModalActionButton
                                    action={resolvedCancelAction}
                                    fallbackVariant="cancel"
                                />
                            )}
                            {primaryAction && (
                                <ModalActionButton
                                    action={primaryAction}
                                    fallbackVariant="primary"
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}

function ModalActionButton({
    action,
    fallbackVariant,
}: {
    action: ModalAction;
    fallbackVariant: "primary" | "secondary" | "danger" | "cancel";
}) {
    const {
        label,
        icon,
        variant = fallbackVariant === "cancel" ? "secondary" : fallbackVariant,
        ...props
    } = action;

    if (fallbackVariant === "cancel") {
        return (
            <button
                type="button"
                className="px-2 py-1.5 text-sm text-gray-500 transition-colors hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                {...props}
            >
                {label}
            </button>
        );
    }

    const tone =
        variant === "danger"
            ? "danger"
            : fallbackVariant === "secondary" && variant === "secondary"
              ? "blue"
              : variant === "primary"
                ? "black"
                : "white";

    return (
        <PillButton tone={tone} size="normal" {...props}>
            {icon}
            {label}
        </PillButton>
    );
}
