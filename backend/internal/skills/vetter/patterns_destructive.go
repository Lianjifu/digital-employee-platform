package vetter

import "regexp"

// destructive patterns: file or disk destruction primitives.
// All SevBlock — any hit blocks the package.
func init() {
	// rm -rf / or rm -rf /* or rm -rf /tmp/... — any rm -rf against a slash-rooted
	// path is treated as a wipe-disk signal. Benign `rm -rf build/` (relative)
	// is left alone — the slash requirement is the discriminator.
	registerRe("rm-rf-root", SevBlock, CatDestructive,
		"递归删除以 / 开头的路径会触及系统目录；请把工作目录限定到 skill 自己的子目录，或用临时目录隔离。",
		regexp.MustCompile(`\brm\b[^\n]*-[rRfF]+[^\n]*\s+\/\S`))

	// mkfs.* — formats a filesystem, irrecoverably destroys the target volume.
	registerRe("mkfs-format", SevBlock, CatDestructive,
		"格式化文件系统会清空目标设备；skill 不应自行 mkfs。",
		regexp.MustCompile(`\bmkfs(?:\.[a-z0-9]+)?\b`))

	// dd if=/dev/... of=... — raw disk write, classic data loss vector.
	registerRe("dd-disk-write", SevBlock, CatDestructive,
		"dd 直写块设备会覆盖数据；skill 不应直接操作 /dev/。",
		regexp.MustCompile(`\bdd\b[^\n]*\bif\s*=[^\n]*(?:/dev/|\\\\\.\\PHYSICAL)`))

	// fork bomb :(){ :|:& };: — must detect both POSIX and bash variants.
	registerRe("fork-bomb", SevBlock, CatDestructive,
		"fork 炸弹会导致系统不可用；请避免在脚本中定义递归 :() 函数。",
		regexp.MustCompile(`:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:`))

	// shred / wipe — secure-deletion primitives that often show up in destructive skills.
	registerRe("shred-wipe", SevBlock, CatDestructive,
		"shred/wipe 会不可恢复地覆写文件；如需清理请用 rm 并限制在临时目录。",
		regexp.MustCompile(`\b(?:shred|sfill|wipe|srm)\b`))

	// mkfs.ext / mkfs.xfs / mkfs.btrfs / mkfs.vfat etc.
	registerRe("mkfs-variant", SevBlock, CatDestructive,
		"mkfs.* 会格式化设备；skill 不应自行创建文件系统。",
		regexp.MustCompile(`\bmkfs\.[a-z0-9]+\b`))
}