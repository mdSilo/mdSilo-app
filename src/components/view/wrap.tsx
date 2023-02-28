/* eslint-disable @typescript-eslint/no-explicit-any */
import { invoke } from '@tauri-apps/api/tauri';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import { getFavicon, isSVG } from 'utils/helper';

type AppMeta = {
  name: string;
  icon: string;
  url: string;
  domain?: string;
  script?: string;
}

type AppItemProps = {
  ty: string;
  meta: AppMeta;
  size?: 'lg' | 'sm';
  disabled?: boolean;
}

function AppItem (props: AppItemProps) {
  const { ty, meta, size = 'lg', disabled = false } = props;
  const handleWebWindow = async () => {
    if (disabled) return;
    if (!meta.url) return;
    await invoke('web_window', {
      label: Date.now().toString(16),
      title: `${ty} / ${meta.name}`,
      url: meta.url,
      script: meta?.script,
    });
  };

  return (
    <div 
      className={`flex flex-col items-center justify-center my-2 mx-4 cursor-pointer ${size}`} 
      onClick={handleWebWindow} 
      title={meta.name}
    >
      {isSVG(meta?.icon)
        ? <i 
            className="w-16 h-16" 
            dangerouslySetInnerHTML={{ __html: meta.icon }} 
          />
        : <img 
            className="w-16 h-16" 
            src={meta.icon ? meta.icon : getFavicon(meta.domain || meta.url)} 
          /> 
      }
      <div className="text-black dark:text-white">{meta.name}</div>
    </div>
  )
}

export default function Wrap() {
  // TODO: customize and load apps 
  return (
    <ErrorBoundary>
      {defaultApps?.app?.map((group: any, idx: number) => {
          return (
            <div className="p-4 m-4 bg-slate-400" key={`${group.ty}_${idx}`}>
              {group.ty && <h3 className="text-black dark:text-white">{group.ty}</h3>}
              <div className="flex flex-wrap p-2">
                {group?.items?.map((app: AppMeta) => (
                  <AppItem
                    key={app.name}
                    meta={app}
                    ty={group.ty}
                  />
                ))}
              </div>
            </div>
          )
        })
      }
    </ErrorBoundary>
  )
}

const defaultApps = {
	"title": "Assistant for mdsilo",
  "app": [
    {
			"ty": "Assistant for mdsilo",
			"items": [
        {
					"name": "ChatGPT",
					"url": "https://chat.openai.com",
          "domain": "https://openai.com", 
					"script": ""
				},
				{
					"name": "WikiPedia",
					"url": "https://www.wikipedia.org/",
					"icon": ""
				}
			]
		},
    {
			"ty": "Bookmark",
			"items": [
        {
					"name": "Rust",
					"url": "https://www.rust-lang.org/",
          "domain": "https://rust-lang.org/", 
					"icon": "https://www.rust-lang.org/static/images/rust-logo-blk.svg"
				},
				{
					"name": "Crates",
					"url": "https://crates.io/",
					"icon": ""
				},
        {
					"name": "Docs",
					"url": "https://docs.rs/",
					"icon": ""
				}
			]
		}
	]
};
