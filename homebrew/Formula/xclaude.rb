class Xclaude < Formula
  desc "iOS-focused AI coding assistant powered by Claude"
  homepage "https://github.com/<you>/XClaude"
  version "0.1.0"
  license "MIT"

  on_arm do
    url "https://github.com/<you>/XClaude/releases/download/v#{version}/xclaude-arm64"
    sha256 "<replace-with-arm64-sha256-from-build-binary-sh>"
  end

  on_intel do
    url "https://github.com/<you>/XClaude/releases/download/v#{version}/xclaude-x86"
    sha256 "<replace-with-x86-sha256-from-build-binary-sh>"
  end

  def install
    if Hardware::CPU.arm?
      bin.install "xclaude-arm64" => "xclaude"
    else
      bin.install "xclaude-x86" => "xclaude"
    end
  end

  def caveats
    <<~EOS
      xclaude requires:
        - Xcode (for xcodebuild and xcrun simctl)
        - SwiftLint (optional, for /lint): brew install swiftlint
        - A Claude.ai account (for AI features)

      On first run, xclaude will authenticate with Claude.ai via OAuth.
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/xclaude --version")
  end
end
