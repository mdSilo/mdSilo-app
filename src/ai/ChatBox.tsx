

export default function ChatBox() {
  return (
    <div className="flex w-full h-full dark:bg-gray-900">
      <div
        className={`flex flex-col flex-none h-full border-r border-lime-900 bg-gray-50 dark:bg-gray-800 dark:text-gray-300`}
      >
        Session List
      </div>
      <div className="relative flex-1 flex flex-col overflow-y-auto">
        Hello
      </div>
    </div>
  );
}
