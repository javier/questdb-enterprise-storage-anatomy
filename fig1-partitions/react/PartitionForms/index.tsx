import { useColorMode } from "@docusaurus/theme-common"
import React, { useEffect, useRef } from "react"

import * as kit from "./kit/iso-kit.mjs"
import * as lathe from "./kit/lathe.mjs"
import "./kit/iso.css"
import { mount } from "./live.mjs"
import { DATA, PLATE_HTML } from "./plate.generated.mjs"

// Fig 1 of the storage anatomy series: a storage policy ageing day partitions.
// The plate (card, SVG, legend, caption) is prebuilt; the live module moves the
// gantry press and redraws tray contents. The theme follows the site.
export default function PartitionForms(): JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  const { colorMode } = useColorMode()

  useEffect(() => {
    const stage = root.current?.querySelector<HTMLElement>(".iso-stage")
    if (!stage) return undefined
    return mount(stage, DATA, kit, lathe)
  }, [])

  return (
    <div
      ref={root}
      className="iso"
      data-theme={colorMode === "dark" ? "dark" : "light"}
      dangerouslySetInnerHTML={{ __html: PLATE_HTML }}
    />
  )
}
