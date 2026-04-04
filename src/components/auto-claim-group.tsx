"use client";

import { useEffect } from "react";
import { addGroupId } from "@/lib/local-groups";

export function AutoClaimGroup({ groupId }: { groupId: number }) {
  useEffect(() => {
    addGroupId(groupId);
  }, [groupId]);
  return null;
}
