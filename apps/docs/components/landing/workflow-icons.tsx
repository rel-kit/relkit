import styles from "./workflow-icons.module.css";

// Hugeicons Animated (MIT): https://github.com/enesgules/hugeicons-animated
// Adapted database, folder-01, link-01 and cloud-upload to shared CSS timelines.
// Original geometry and gestures are retained; see hugeicons-license.txt.
const middlePlatter = "M20 12C20 13.6569 16.4183 15 12 15C7.58172 15 4 13.6569 4 12";
const bottomPlatter = "M20 19C20 20.6569 16.4183 22 12 22C7.58172 22 4 20.6569 4 19";

export function WorkflowIcon({
  name,
}: {
  readonly name: "database" | "folder" | "link" | "cloud-upload";
}) {
  return (
    <svg
      className={styles.icon}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-hugeicon={name}
    >
      {name === "database" && (
        <>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d={middlePlatter} />
          <path d="M7 10.842C7.60158 11.0229 8.27434 11.1718 9 11.282M7 17.842C7.60158 18.0229 8.27434 18.1718 9 18.282" />
          <path d="M20 5V19C20 20.6569 16.4183 22 12 22C7.58172 22 4 20.6569 4 19V5" />
          <ellipse
            className={styles.scan}
            data-flow-motion=""
            cx="12"
            cy="5"
            rx="8"
            ry="3"
            pathLength="100"
          />
          {[middlePlatter, bottomPlatter].map((d, index) => (
            <path
              key={d}
              d={d}
              className={styles.scan}
              data-flow-motion=""
              pathLength="100"
              style={{ animationDelay: `${1.8 + index * 0.14}s` }}
            />
          ))}
          <path
            className={styles.records}
            data-flow-motion=""
            d="M10.5 11.4H12.25M13.75 11.4H16.5M10.5 18.4H14M15.5 18.4H17"
          />
        </>
      )}
      {name === "folder" && (
        <path
          className={styles.folder}
          data-flow-motion=""
          d="M8 7H16.75C18.8567 7 19.91 7 20.6667 7.50559C20.9943 7.72447 21.2755 8.00572 21.4944 8.33329C22 9.08996 22 10.1433 22 12.25C22 15.7612 22 17.5167 21.1573 18.7779C20.7926 19.3238 20.3238 19.7926 19.7779 20.1573C18.5167 21 16.7612 21 13.25 21H12C7.28595 21 4.92893 21 3.46447 19.5355C2 18.0711 2 15.714 2 11V7.94427C2 6.1278 2 5.21956 2.38032 4.53806C2.65142 4.05227 3.05227 3.65142 3.53806 3.38032C4.21956 3 5.1278 3 6.94427 3C8.10802 3 8.6899 3 9.19926 3.19101C10.3622 3.62712 10.8418 4.68358 11.3666 5.73313L12 7"
        />
      )}
      {name === "link" && (
        <g className={styles.link} data-flow-motion="">
          <path d="M9.14339 10.691L9.35031 10.4841C11.329 8.50532 14.5372 8.50532 16.5159 10.4841C18.4947 12.4628 18.4947 15.671 16.5159 17.6497L13.6497 20.5159C11.671 22.4947 8.46279 22.4947 6.48405 20.5159C4.50532 18.5372 4.50532 15.329 6.48405 13.3503L6.9484 12.886" />
          <path d="M17.0516 11.114L17.5159 10.6497C19.4947 8.67095 19.4947 5.46279 17.5159 3.48405C15.5372 1.50532 12.329 1.50532 10.3503 3.48405L7.48405 6.35031C5.50532 8.32904 5.50532 11.5372 7.48405 13.5159C9.46279 15.4947 12.671 15.4947 14.6497 13.5159L14.8566 13.309" />
        </g>
      )}
      {name === "cloud-upload" && (
        <>
          <path
            className={styles.cloud}
            data-flow-motion=""
            d="M17.4776 9.01106C17.485 9.01102 17.4925 9.01101 17.5 9.01101C19.9853 9.01101 22 11.0294 22 13.5193C22 15.8398 20.25 17.7508 18 18M17.4776 9.01106C17.4924 8.84606 17.5 8.67896 17.5 8.51009C17.5 5.46695 15.0376 3 12 3C9.12324 3 6.76233 5.21267 6.52042 8.03192M17.4776 9.01106C17.3753 10.1476 16.9286 11.1846 16.2428 12.0165M6.52042 8.03192C3.98398 8.27373 2 10.4139 2 13.0183C2 15.4417 3.71776 17.4632 6 17.9273M6.52042 8.03192C6.67826 8.01687 6.83823 8.00917 7 8.00917C8.12582 8.00917 9.16474 8.38194 10.0005 9.01101"
          />
          <path
            className={styles.upload}
            data-flow-motion=""
            d="M12 13L12 21M12 13C11.2998 13 9.99153 14.9943 9.5 15.5M12 13C12.7002 13 14.0085 14.9943 14.5 15.5"
          />
        </>
      )}
    </svg>
  );
}
