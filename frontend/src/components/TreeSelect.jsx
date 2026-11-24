/** Select hai cấp (cha-con) cho ngành nghề và địa điểm; tree lấy từ toTree(). */
export default function TreeSelect({ id, value, onChange, tree, placeholder, className, required, invalid }) {
  return (
    <select
      id={id}
      value={value}
      required={required}
      aria-invalid={invalid || undefined}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    >
      <option value="">{placeholder}</option>
      {tree.map((parent) =>
        parent.children.length ? (
          <optgroup key={parent.id} label={parent.name}>
            <option value={parent.id}>{`${parent.name} (tất cả)`}</option>
            {parent.children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </optgroup>
        ) : (
          <option key={parent.id} value={parent.id}>
            {parent.name}
          </option>
        ),
      )}
    </select>
  );
}
