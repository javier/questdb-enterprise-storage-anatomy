import { useColorMode } from "@docusaurus/theme-common"
import React, { useEffect, useRef } from "react"

import * as kit from "./kit/iso-kit.mjs"
import * as lathe from "./kit/lathe.mjs"
import "./kit/iso.css"
import { mount } from "./live.mjs"
import { DATA, PLATE_HTML } from "./plate.generated.mjs"

// Fig 2 of the storage anatomy series: one query reading across storage tiers.
// The plate (card, controls, SVG, legend, caption) is prebuilt; the live module lights
// what the query reads. The theme follows the site.
export default function QueriesAcrossTiers(): JSX.Element {
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
