"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()} size="small" variant="secondary">
      <Printer size={15} /> Print report
    </Button>
  );
}
