function MetadataStrip({ metadata }) {
  const items = [
    `From: ${metadata.emailFrom || 'Unknown'}`,
    `Subject: ${metadata.emailSubject || 'Unknown'}`,
    `Links: ${metadata.linkCount}`,
    `Attachment: ${metadata.attachmentDetected ? 'Yes' : 'No'}`,
    `Input: ${metadata.inputType.replace('_', ' ')}`,
    `Source: ${metadata.analysisSource ? metadata.analysisSource.replaceAll('_', ' ') : 'unknown'}`
  ];

  return (
    <section className="metadata-strip panel">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </section>
  );
}

export default MetadataStrip;
