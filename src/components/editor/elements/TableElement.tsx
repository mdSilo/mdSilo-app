import { EditorElementProps } from './EditorElement';

export function TableElement(props: EditorElementProps) {
  const { className = '', attributes, children } = props;
  const tableClass = `table-auto border-collapse border border-green-800 ${className}`;
  return (
    <table className={tableClass}>
      <tbody {...attributes}>{children}</tbody>
    </table>
  )
}

export function TableRowElement(props: EditorElementProps) {
  const { attributes, children } = props;
  return (
    <tr {...attributes}>{children}</tr>
  );
}

export function TableCellElement(props: EditorElementProps) {
  const { className = '', attributes, children } = props;
  const tdClass = `px-4 py-2 border border-green-800 ${className}`;
  return (
    <td className={tdClass} {...attributes}>{children}</td>
  );
}
