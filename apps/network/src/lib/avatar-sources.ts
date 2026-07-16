export interface NetworkAvatarSources {
  detailUrl: string
  graphUrl: string
}

export function resolveNetworkAvatarSources(source: string): NetworkAvatarSources {
  let url: URL
  try {
    url = new URL(source)
  } catch {
    return { detailUrl: source, graphUrl: source }
  }

  if (url.hostname === "talx.dod.ngo" && url.pathname.endsWith(".webp")) {
    const detailUrl = new URL(url)
    detailUrl.pathname = detailUrl.pathname.replace(
      /_(?:thumbnail_tiny|thumbnail_default)\.webp$/,
      ".webp",
    )

    const graphUrl = new URL(detailUrl)
    graphUrl.pathname = graphUrl.pathname.replace(/\.webp$/, "_thumbnail_default.webp")
    return { detailUrl: detailUrl.href, graphUrl: graphUrl.href }
  }

  if (url.hostname === "dwebcamp.org" && /\.(?:jpe?g|png|webp)$/i.test(url.pathname)) {
    const detailUrl = new URL(url)
    detailUrl.pathname = detailUrl.pathname.replace(/\.thumbnail(?=\.(?:jpe?g|png|webp)$)/i, "")

    const graphUrl = new URL(detailUrl)
    graphUrl.pathname = graphUrl.pathname.replace(
      /(\.(?:jpe?g|png|webp))$/i,
      ".thumbnail$1",
    )
    return { detailUrl: detailUrl.href, graphUrl: graphUrl.href }
  }

  return { detailUrl: source, graphUrl: source }
}
