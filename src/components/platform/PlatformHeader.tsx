"use client";

import { createElement, useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Search, Bell, Clock, ChevronRight, LogOut, User, Settings } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useSidebar } from "./SidebarContext";
import { getEngineById } from "@/lib/engines/registry";

import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";

const iconCache = new Map<string, LucideIcon>();

function getIcon(name: string): LucideIcon {
  const cached = iconCache.get(name);
  if (cached) return cached;
  const icon = (LucideIcons as unknown as Record<string, LucideIcon>)[name] || LucideIcons.Hexagon;
  iconCache.set(name, icon);
  return icon;
}

function renderIcon(name: string, className?: string, style?: React.CSSProperties) {
  return createElement(getIcon(name), { className, style });
}

export default function PlatformHeader() {
  const { collapsed } = useSidebar();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const engineMatch = pathname.match(/^\/engines\/([^/]+)/);
  const engineId = engineMatch ? engineMatch[1] : "command-center";
  const engine = getEngineById(engineId);

  const isHistory = pathname === "/history";

  // Close menu on outside click
  useEffect(() => {
    if (!showUserMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    requestAnimationFrame(() => {
      document.addEventListener("mousedown", handler);
    });
    return () => document.removeEventListener("mousedown", handler);
  }, [showUserMenu]);

  return (
    <motion.header
      className="fixed top-0 right-0 z-30 h-[68px] border-b border-white/[0.06] bg-[#030712]/90 backdrop-blur-md flex items-center justify-between px-6"
      animate={{ left: collapsed ? 64 : 256 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {engine && (
          <div className="flex items-center gap-2 min-w-0">
            {renderIcon(engine.icon, "w-4 h-4 shrink-0", { color: engine.accentColor })}
            <span className="text-sm font-semibold text-white truncate">{engine.name}</span>
          </div>
        )}

        {isHistory && (
          <>
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <div className="flex items-center gap-1.5 text-sm text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              <span>History</span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button className="hover:text-white text-slate-400 transition-colors" aria-label="Search">
          <Search className="w-[18px] h-[18px]" />
        </button>
        <button className="hover:text-white text-slate-400 transition-colors" aria-label="Notifications">
          <Bell className="w-[18px] h-[18px]" />
        </button>

        {/* User avatar / auth */}
        <div className="relative" ref={menuRef}>
          {status === "authenticated" && session?.user ? (
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="relative group"
              aria-label="User menu"
            >
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name ?? "User"}
                  className="w-8 h-8 rounded-lg object-cover ring-2 ring-transparent group-hover:ring-prism-sky/30 transition-all"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-prism-sky to-prism-accent flex items-center justify-center ring-2 ring-transparent group-hover:ring-prism-sky/30 transition-all">
                  <span className="text-xs font-bold text-white">
                    {(session.user.name ?? session.user.email ?? "U").charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              {/* Online indicator */}
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#030712]" />
            </button>
          ) : status === "unauthenticated" ? (
            <Link
              href="/auth/signin"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-prism-sky bg-prism-sky/10 hover:bg-prism-sky/20 border border-prism-sky/20 transition-all"
            >
              <User className="w-3.5 h-3.5" />
              Sign In
            </Link>
          ) : (
            // Loading state
            <div className="w-8 h-8 rounded-lg bg-white/5 animate-pulse" />
          )}

          {/* Dropdown menu */}
          <AnimatePresence>
            {showUserMenu && session?.user && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-white/10 bg-[#0a0f1e] shadow-2xl shadow-black/50 overflow-hidden"
              >
                {/* User info */}
                <div className="px-4 py-3 border-b border-white/8">
                  <p className="text-sm font-medium text-white truncate">
                    {session.user.name ?? "User"}
                  </p>
                  <p className="text-xs text-prism-muted truncate">
                    {session.user.email}
                  </p>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <Link
                    href="/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-prism-muted hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </Link>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      signOut({ callbackUrl: "/auth/signin" });
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-prism-muted hover:text-red-400 hover:bg-red-500/5 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.header>
  );
}
