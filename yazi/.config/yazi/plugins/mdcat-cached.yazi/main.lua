-- Preview markdown files with mdcat (fixed for Yazi 26.1.22 plugin API)
--
-- mdcat runs once per file and preview width; its output is cached under Yazi's cache
-- directory so scrolling only reads lines from the cache instead of re-rendering.
--
-- The cache lives in a directory per Yazi instance ($YAZI_ID), so restarting Yazi renders
-- again. Each directory records its Yazi's PID; directories of Yazi instances that are no
-- longer running are removed whenever a new file is rendered.
local M = {}

-- Create this instance's cache directory and remove those of exited instances. The shell's
-- parent is Yazi itself, so $PPID is this instance's PID.
local PREPARE = [[
root=$1 id=$2
mkdir -p "$root/$id" || exit 1
[ -s "$root/$id/pid" ] || echo "$PPID" > "$root/$id/pid"
for dir in "$root"/*/; do
	dir=${dir%/}
	[ "$dir" = "$root/$id" ] && continue
	pid=$(cat "$dir/pid" 2>/dev/null)
	[ -n "$pid" ] && [ -d "/proc/$pid" ] || rm -rf "$dir"
done
]]

local function show_error(job, msg)
	ya.preview_widget(job, ui.Text.parse(msg):area(job.area):wrap(ui.Wrap.YES))
end

-- Returns the cache path holding mdcat's output for this file at this width, rendering
-- it first if needed. `ya.file_cache` already keys on the file's URL and mtime.
local function render(job)
	local base = ya.file_cache { file = job.file, skip = 0 }
	if not base then
		return nil, 'mdcat: no cache path for this file'
	end
	local root = tostring(base):match('^(.*)/') .. '/mdcat'
	local dir = root .. '/' .. (os.getenv('YAZI_ID') or 'default')
	local cache = dir .. '/' .. tostring(base):match('[^/]+$') .. '-' .. job.area.w
	if fs.cha(Url(cache)) then
		return cache
	end

	local prepared = Command('sh'):arg({ '-c', PREPARE, 'sh', root, dir:match('[^/]+$') }):status()
	if not prepared or not prepared.success then
		return nil, 'mdcat: failed to create cache directory ' .. dir
	end

	-- --ansi keeps colours although stdout is a pipe, without terminal-specific images.
	local output, err = Command('mdcat')
		:arg({ '--ansi', '--columns', tostring(job.area.w), tostring(job.file.url) })
		:stdout(Command.PIPED)
		:stderr(Command.PIPED)
		:output()
	if not output then
		return nil, 'mdcat: ' .. tostring(err)
	elseif not output.status.success then
		return nil, output.stderr ~= '' and output.stderr or ('mdcat exited with code ' .. tostring(output.status.code))
	end

	-- Strip OSC-8 hyperlink wrappers (keep link text); ansi-to-tui would otherwise
	-- swallow text until the next BEL, since it doesn't handle ST-terminated OSC.
	local text = output.stdout:gsub('\x1b%]8;.-\x1b\\', '')
	text = text:gsub('\x1b%]8;[^%c]*%c', '')

	-- Write to a temporary file and rename, so a concurrent peek never reads a partial cache.
	local tmp = cache .. '.' .. tostring(ya.time()) .. '.part'
	local file = io.open(tmp, 'w')
	if not file then
		return nil, 'mdcat: failed to write cache ' .. tmp
	end
	file:write(text)
	file:close()
	os.rename(tmp, cache)
	return cache
end

function M:peek(job)
	local cache, err = render(job)
	if not cache then
		return show_error(job, err)
	end

	local file = io.open(cache, 'r')
	if not file then
		return show_error(job, 'mdcat: failed to open cache ' .. cache)
	end
	local limit, i, outs = job.area.h, 0, {}
	for line in file:lines('L') do
		i = i + 1
		if i > job.skip + limit then
			break
		elseif i > job.skip then
			outs[#outs + 1] = line
		end
	end
	file:close()

	if job.skip > 0 and i < job.skip + limit then
		ya.emit('peek', { math.max(0, i - limit), only_if = job.file.url, upper_bound = true })
	else
		ya.preview_widget(job, ui.Text.parse(table.concat(outs, '')):area(job.area))
	end
end

function M:seek(job)
	local h = cx.active.current.hovered
	if not h or h.url ~= job.file.url then
		return
	end

	ya.emit('peek', { math.max(0, cx.active.preview.skip + job.units), only_if = job.file.url })
end

return M
