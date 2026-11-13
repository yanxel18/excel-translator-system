export default function WorkbookIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="workbook-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="2" width="18" height="20" rx="2" fill="#168547" />
      <path d="M12 5h6v3h-6zm0 5h6v3h-6zm0 5h6v3h-6z" fill="#d9f2e3" />
      <path d="M5 6h6v12H5z" fill="#106b39" />
      <path d="m6.2 8 1.5 2.5L9.2 8h1.4l-2.2 3.8 2.3 4H9.2l-1.6-2.7L6 15.8H4.6l2.3-4L4.8 8z" fill="#fff" />
    </svg>
  );
}
