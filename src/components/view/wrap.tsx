/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react';
import { IconPlus } from '@tabler/icons';
import { invoke } from '@tauri-apps/api/tauri';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import Tooltip from 'components/misc/Tooltip';
import RawMarkdown from 'components/md/Markdown';
import { getFavicon, isSVG } from 'utils/helper';
import { useStore } from 'lib/store';
import { joinPaths } from 'file/util';
import FileAPI from 'file/files';

type AppMeta = {
  name: string;
  url: string;
  icon?: string;
  domain?: string;
  script?: string;
}

type AppEntry = {
  ty: string;
  items: AppMeta[];
}

type WrapEntry = {
  title: string;
  app: AppEntry[];
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
      {meta?.icon && isSVG(meta?.icon)
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
  const [isLoaded, setIsLoaded] = useState(false);
  const [content, setContent] = useState(defaultApps);
  const [wrapConfigPath, setWrapConfigPath] = useState('');
  useEffect(() => {
    if (!isLoaded) {
      invoke("create_mdsilo_dir").then((path) => {
        // console.log("mdsilo dir", path);
        joinPaths((path as string), ["wrap.json"]).then((configPath) => {
          setWrapConfigPath(configPath);
          const jsonFile = new FileAPI(configPath);
          jsonFile.readFile().then(json => {
            if (json.trim()) setContent(JSON.parse(json));
          });
        })
      })
    }
    return () => { setIsLoaded(true); };
  }, [isLoaded]);

  const [showAdd, setShowAdd] = useState(false);
  const darkMode = useStore((state) => state.darkMode);

  const onContentChange = useCallback(
    async (text: string) => {
      if (wrapConfigPath) {
        const jsonFile = new FileAPI(wrapConfigPath);
        await jsonFile.writeFile(text);
        setIsLoaded(false);
      }
    },
    [wrapConfigPath]
  );
  
  return (
    <ErrorBoundary>
      <Tooltip content="Config Wrap" placement="bottom">
        <button
          className="p-2 mx-2 text-sm text-black rounded bg-primary-200 hover:bg-primary-100"
          onClick={() => setShowAdd(!showAdd)}
        >
          <IconPlus size={15} className="" />
        </button>
      </Tooltip>
      {showAdd ? (
        <RawMarkdown
          key="app-json"
          initialContent={JSON.stringify(content)}
          onChange={onContentChange}
          dark={darkMode}
          lang={"json"}
          className={"text-xl m-2"}
        />
      ) : (
        (content as any)?.app?.map((group: any, idx: number) => {
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
      )}
    </ErrorBoundary>
  )
}


const defaultApps: WrapEntry = {
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
					"name": "PlayGround",
					"url": "https://play.rust-lang.org/",
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
