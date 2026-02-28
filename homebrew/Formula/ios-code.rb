class IosCode < Formula
  desc "iOS-focused AI coding assistant powered by Claude"
  homepage "https://github.com/<you>/ios-code"
  version "0.1.0"
  license "MIT"

  on_arm do
    url "https://github.com/<you>/ios-code/releases/download/v#{version}/ios-code-arm64"
    sha256 "<replace-with-arm64-sha256-from-build-binary-sh>"
  end

  on_intel do
    url "https://github.com/<you>/ios-code/releases/download/v#{version}/ios-code-x86"
    sha256 "<replace-with-x86-sha256-from-build-binary-sh>"
  end

  def install
    if Hardware::CPU.arm?
      bin.install "ios-code-arm64" => "ios-code"
    else
      bin.install "ios-code-x86" => "ios-code"
    end
  end

  def caveats
    <<~EOS
      ios-code requires:
        - Xcode (for xcodebuild and xcrun simctl)
        - SwiftLint (optional, for /lint): brew install swiftlint
        - A Claude.ai account (for AI features)

      On first run, ios-code will authenticate with Claude.ai via OAuth.
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/ios-code --version")
  end
end
